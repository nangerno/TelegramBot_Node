const { Telegraf } = require("telegraf");
const axios = require("axios");
const db = require("../models");
const TelUser = db.telusers;
const Tx = db.txs;
const { Web3 } = require("web3");
const fs = require("fs");
const path = require("path");
const { receiveMessageOnPort } = require("worker_threads");
const { notStrictEqual } = require("assert");
const tokenAbiFile = fs.readFileSync(path.resolve(__dirname, "./abi.json"));
const tokenAbi = JSON.parse(tokenAbiFile);

const delay = (duration) =>
  new Promise((resolve, reject) => {
    try {
      setTimeout(() => {
        resolve();
      }, [duration * 1000]);
    } catch (err) {
      reject();
    }
});
module.exports = (app) => {
  const bot = new Telegraf(process.env.BOT_TOKEN);
  bot.launch();

  bot.command("start", async (ctx) => {
    const data = await TelUser.find({ id: ctx.from.id });
    if (data.length == 0) {
      const user = await TelUser.find({ userName: ctx.from.username });
      if (user.length === 0) {
        await createAccount(
          ctx.from.id,
          ctx.from.username,
          ctx.from.first_name
        );
      } else {
        await TelUser.findOneAndUpdate(
          { id: ctx.from.username },
          { id: ctx.from.id, displayName: ctx.from.first_name }
        );
      }
    } else {
      if (!data[0].userName) {
        await TelUser.findOneAndUpdate(
          { id: ctx.from.id },
          { userName: ctx.from.username }
        );
      }
    }
    bot.telegram.sendMessage(
      ctx.chat.id,
      "Use these command to... \n1. Get your balance: /getBalance\n2. Deposit: /deposit\n3. Withdraw: /withdraw\n4. New Deposit Password: /newpassword\n5. Call this list: /refresh",
      {}
    );
  });

  bot.command("refresh", async (ctx) => {
    bot.telegram.sendMessage(
      ctx.chat.id,
      "Use these command to... \n1. Get your balance: /getBalance\n2. Deposit: /deposit\n3. Withdraw: /withdraw\n4. New Deposit Password: /newpassword\n5. Call this list: /refresh",
      {}
    );
  });

  //////
  bot.command("newpassword", async (ctx) => {
    if (ctx.chat.title) {
      return;
    } else {
      let uniqueCode = "";
      const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      for (let i = 0; i < 8; i++) {
        uniqueCode += characters.charAt(
          Math.floor(Math.random() * characters.length)
        );
      }
      await TelUser.findOneAndUpdate(
        { id: ctx.from.id },
        { uniqueCode: uniqueCode },
        {
          useFindAndModify: false,
        }
      );
      await ctx.reply("Deposit password updated.");
      await ctx.reply(uniqueCode);
    }
  });
  //////
  bot.command("withdraw", async (ctx) => {
    if (ctx.chat.title) {
      return;
    } else {
      setTimeout(async () => {
        await ctx.reply("/withdraw(ela/gold) <amount> <address>");
      }, 800);
      setTimeout(async () => {
        await ctx.reply(
          "Only withdraw to Elastos Smart Chain wallets. Network fees may occur.\n\nUse the following command to withdraw:"
        );
      }, 400);
    }
  });
  //////
  bot.command("withdrawela", async (ctx) => {
    const inputText = ctx.message.text;
    const commandParts = inputText.split(" ");
    const walletAddress = commandParts[2]; // Get the wallet address from the input
    const addressRegex = /(0x[0-9a-fA-F]{40})/; // Regular expression to match Ethereum wallet addresses
    if (addressRegex.test(walletAddress)) {
      const amount = parseFloat(commandParts[1]);
      if (!isNaN(amount) && amount > 0) {
        const userData = await TelUser.find({
          id: ctx.from.id,
        });
        if (userData[0].elaAmount < amount) {
          ctx.reply("You don't have enough Ela.");
        } else {
          if (userData[0].elaAmount > amount + 0.0001) {
            ctx.reply("Processing");
            const web3 = new Web3("https://api.elastos.io/esc");
            const privateKey = Buffer.from(process.env.PRIVATE_KEY, "hex");
            const account = web3.eth.accounts.privateKeyToAccount(privateKey);
            const nonce = await web3.eth.getTransactionCount(
              account.address,
              "pending"
            );
            const rawTransaction = {
              from: process.env.PUBLIC_KEY,
              to: walletAddress,
              value: (amount * Math.pow(10, 18)).toString(),
              gas: "21000",
              gasPrice: await web3.eth.getGasPrice(),
              nonce: nonce,
            };
            const signedTx = await web3.eth.accounts.signTransaction(
              rawTransaction,
              process.env.PRIVATE_KEY
            );
            const receipt = await web3.eth.sendSignedTransaction(
              signedTx.rawTransaction
            );
            setTimeout(async () => {
              await ctx.reply(`Transaction completed`);
            }, 400);
            const transactioinData = await axios.post(
              `https://esc.elastos.io/api/?module=transaction&action=gettxinfo&txhash=${receipt.transactionHash}`
            );
            const transactionfee =
              (parseInt(transactioinData.data.result.gasLimit) *
                parseInt(transactioinData.data.result.gasPrice)) /
              Math.pow(10, 18);
            const user = await TelUser.find({
              id: ctx.from.id,
            });
            setTimeout(() => {
              ctx.reply(
                `Old balance:\nELA: ${parseFloat(
                  user[0].elaAmount.toFixed(12).toString()
                )}\nGOLD: ${parseFloat(
                  user[0].goldAmount.toFixed(12).toString()
                )}`
              );
            }, 800);
            const telUser = {
              id: ctx.from.id,
              displayName: ctx.from.first_name,
              userName: ctx.from.username,
              elaAmount: user[0].elaAmount - amount - transactionfee,
              goldAmount: user[0].goldAmount,
              uniqueCode: user[0].uniqueCode,
            };
            TelUser.findOneAndUpdate({ id: ctx.from.id }, telUser, {
              useFindAndModify: false,
            }).then((data) => {
              setTimeout(() => {
                ctx.reply(
                  `New balance:\nELA: ${parseFloat(
                    telUser.elaAmount.toFixed(12).toString()
                  )}\nGOLD: ${parseFloat(
                    telUser.goldAmount.toFixed(12).toString()
                  )}`
                );
              }, 1200);
            });
          }
        }
      } else {
        ctx.reply("Invalid Input.");
      }
    } else {
      // If the input does not contain a valid Ethereum wallet address
      ctx.reply(
        "Invalid wallet address provided. Please provide a valid Elastos Smart Chain wallet address."
      );
    }
  });

  ///
  bot.command("test", async (ctx) => {
    // const inputText = ctx.message.text;
    // const commandParts = inputText.split(" ");
    // console.log(detectFloatWithCommaOrPeriod(commandParts[1]));
  });
  ///////
  bot.command("withdrawgold", async (ctx) => {
    const inputText = ctx.message.text;
    const commandParts = inputText.split(" ");
    const walletAddress = commandParts[2]; // Get the wallet address from the input
    const addressRegex = /(0x[0-9a-fA-F]{40})/; // Regular expression to match Ethereum wallet addresses
    if (addressRegex.test(walletAddress)) {
      const amount = parseFloat(commandParts[1]);
      if (!isNaN(amount) && amount > 0) {
        const userData = await TelUser.find({
          id: ctx.from.id,
        });
        if (userData[0].goldAmount >= amount) {
          const WalletData = await axios.post(
            `https://esc.elastos.io/api/?module=account&action=balance&address=${process.env.PUBLIC_KEY}`
          );
          const walletBalance =
            parseInt(WalletData.data.result) / Math.pow(10, 18);
          if (userData[0].elaAmount > 0.0001) {
            ctx.reply("Processing");
            const web3 = new Web3("https://api.elastos.io/esc");
            const privateKey = Buffer.from(process.env.PRIVATE_KEY, "hex");
            const account = web3.eth.accounts.privateKeyToAccount(privateKey);
            const tokenContract = new web3.eth.Contract(
              tokenAbi,
              process.env.GOLD_TOKEN_ADDRESS
            );
            const toAddress = walletAddress;
            const goldAmount = parseInt(amount * Math.pow(10, 18)).toString();
            const data = tokenContract.methods
              .transfer(toAddress, goldAmount)
              .encodeABI();
            const nonce = await web3.eth.getTransactionCount(
              account.address,
              "pending"
            );
            const gasPrice = await web3.eth.getGasPrice();
            const rawTransaction = {
              nonce: web3.utils.toHex(nonce),
              gasPrice: web3.utils.toHex(gasPrice),
              gasLimit: web3.utils.toHex(80000), // You may need to adjust the gas limit based on the token transfer function
              to: process.env.GOLD_TOKEN_ADDRESS,
              value: "0x00",
              data: data,
            };
            const signedTx = await web3.eth.accounts.signTransaction(
              rawTransaction,
              process.env.PRIVATE_KEY
            );
            const receipt = await web3.eth.sendSignedTransaction(
              signedTx.rawTransaction
            );
            ctx.reply(`Transaction completed`);
            const transactioinData = await axios.post(
              `https://esc.elastos.io/api/?module=transaction&action=gettxinfo&txhash=${receipt.transactionHash}`
            );
            const transactionfee =
              (parseInt(transactioinData.data.result.gasLimit) *
                parseInt(transactioinData.data.result.gasPrice)) /
              Math.pow(10, 18);
            const user = await TelUser.find({
              id: ctx.from.id,
            });
            setTimeout(() => {
              ctx.reply(
                `Old balance:\nELA: ${parseFloat(
                  user[0].elaAmount.toFixed(12).toString()
                )}\nGOLD: ${parseFloat(
                  user[0].goldAmount.toFixed(12).toString()
                )}`
              );
            }, 400);
            const telUser = {
              id: ctx.from.id,
              displayName: ctx.from.first_name,
              userName: ctx.from.username,
              elaAmount: user[0].elaAmount - transactionfee,
              goldAmount: user[0].goldAmount - amount,
              uniqueCode: user[0].uniqueCode,
            };
            TelUser.findOneAndUpdate({ id: ctx.from.id }, telUser, {
              useFindAndModify: false,
            }).then((data) => {
              setTimeout(() => {
                ctx.reply(
                  `New balance:\nELA: ${parseFloat(
                    telUser.elaAmount.toFixed(12).toString()
                  )}\nGOLD: ${parseFloat(
                    telUser.goldAmount.toFixed(12).toString()
                  )}`
                );
              }, 800);
            });
          } else {
            ctx.reply("ELA insufficient. Please deposit ELA for gas.");
          }
        } else {
          ctx.reply("You don't have enough Gold.");
        }
      } else {
        ctx.reply("Invalid Input.");
      }
    } else {
      // If the input does not contain a valid Ethereum wallet address
      ctx.reply(
        "Invalid wallet address provided. Please provide a valid Elastos Smart Chain wallet address."
      );
    }
  });

  //
  bot.command("getBalance", async (ctx) => {
    if (ctx.chat.title) {
      return;
    } else {
      TelUser.find({ id: ctx.from.id }).then(async (data) => {
        if (data.length == 0) {
          const user = await TelUser.find({ id: ctx.from.id });
          if (user.length === 0) {
            const response = await createAccount(
              ctx.from.id,
              ctx.from.username,
              ctx.from.first_name
            );
            if (response == "success") {
              ctx.reply(`Ela: 0 \nGold: 0`);
            }
          } else {
            TelUser.findOneAndUpdate(
              { id: ctx.from.id },
              { id: ctx.from.id, displayName: ctx.from.first_name }
            ).then((data) => {
              ctx.reply(
                `Ela: ${parseFloat(
                  data.elaAmount.toFixed(12).toString()
                )} \nGold: ${parseFloat(
                  data.goldAmount.toFixed(12).toString()
                )}`
              );
            });
          }
        } else {
          let elaAmount = data[0].elaAmount;
          let goldAmount = data[0].goldAmount;
          if (data[0].elaAmount < 0.00000001) {
            elaAmount = 0;
          } else if (data[0].goldAmount < 0.00000001) {
            goldAmount = 0;
          }
          if (!data[0].userName) {
            await TelUser.findOneAndUpdate(
              { id: ctx.from.id },
              { userName: ctx.from.username }
            );
          }

          await ctx.reply(
            `Ela: ${parseFloat(
              elaAmount.toFixed(12).toString()
            )} \nGold: ${parseFloat(goldAmount.toFixed(12).toString())}`
          );
        }
      });
    }
  });
  //
  bot.command("deposit", async (ctx) => {
    if (ctx.chat.title) {
      return;
    } else {
      let user = await TelUser.find({ id: ctx.from.id });
      if (user.length === 0) {
        const data = await TelUser.find({ id: ctx.from.id });
        if (data.length === 0) {
          await createAccount(
            ctx.from.id,
            ctx.from.username,
            ctx.from.first_name
          );
        } else {
          await TelUser.findOneAndUpdate(
            { id: ctx.from.id },
            { id: ctx.from.id, displayName: ctx.from.first_name }
          );
        }
        user = await TelUser.find({ id: ctx.from.id });
      }
      if (user[0].userName === "") {
        await TelUser.findOneAndUpdate(
          { id: ctx.from.id },
          { userName: ctx.from.username }
        );
      }
      for (let i = 0; i < 4; i++) {
        if (i === 0) {
          setTimeout(() => {
            ctx.reply(
              `Please only deposit ELA or GOLD, using the Elastos Smart Chain, to this address:`
            );
          }, 400);
        } else if (i === 1) {
          setTimeout(() => {
            ctx.reply(`${process.env.PUBLIC_KEY}`);
          }, 800);
        } else if (i === 2) {
          setTimeout(() => {
            ctx.reply(
              `Please copy paste the transaction ID, followed by this password, separated with a space.`
            );
          }, 1200);
        } else if (i === 3) {
          setTimeout(() => {
            ctx.reply(`${user[0].uniqueCode}`);
          }, 1600);
        }
      }
    }
  });
  //////
  bot.command("tipela", async (ctx) => {
    const inputText = ctx.message.text;
    const commandParts = inputText.split(" ");
    if (ctx.update.message.reply_to_message) {
      if (ctx.update.message.reply_to_message.from.is_bot === true) {
        ctx.reply(
          "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot."
        );
      } else {
        if (commandParts.length < 2) {
          ctx.reply("Invalid Input.");
        } else if (commandParts.length === 2) {
          if (!isNaN(detectFloatWithCommaOrPeriod(commandParts[1])) && parseFloat(detectFloatWithCommaOrPeriod(commandParts[1])) > 0) {
            const userName = ctx.update.message.reply_to_message.from.username;
            const receiverUserId = ctx.update.message.reply_to_message.from.id;
            const amountString = detectFloatWithCommaOrPeriod(commandParts[1]);
            const displayName =
              ctx.update.message.reply_to_message.from.first_name;
            let nickName;
            if (userName === undefined) {
              nickName = ctx.update.message.reply_to_message.from.first_name;
            } else {
              nickName =
                "@" + ctx.update.message.reply_to_message.from.username;
            }
            const amount = parseFloat(amountString);
            let decimalLength;
            if (amountString.split(".").length > 1) {
              const sublength = amountString.split(".")[1];
              decimalLength = sublength.length;
            } else {
              decimalLength = 0;
            }
            if (amount > 0 && amount !== null) {
              if (decimalLength > 12) {
                ctx.reply("Please tip ELA within 12 decimal.");
              } else {
                if (amount < 0.000000000001) {
                  ctx.reply(
                    "Please tip 0.000000000001 Units of ELA/GOLD or more."
                  );
                } else {
                  const user = await TelUser.find({ id: receiverUserId });
                  const senderUser = await TelUser.find({
                    id: ctx.from.id,
                  });

                  if (user.length === 0) {
                    let uniqueCode = "";
                    const characters =
                      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
                    for (let i = 0; i < 8; i++) {
                      uniqueCode += characters.charAt(
                        Math.floor(Math.random() * characters.length)
                      );
                    }
                    await TelUser.findOneAndUpdate(
                      { id: senderUser[0].id },
                      { elaAmount: senderUser[0].elaAmount - amount }
                    );
                    const telUser = new TelUser({
                      id: receiverUserId,
                      userName: userName,
                      displayName: displayName,
                      elaAmount: amount,
                      goldAmount: 0,
                      uniqueCode: uniqueCode,
                    });
                    telUser.save(telUser);
                    await ctx.reply(
                      `${nickName} received ${amountString} ELA from @ElastosGoldTipbot.`
                    );
                  } else {
                    if (user[0].id === senderUser[0].id) {
                      await ctx.reply(
                        `${nickName} received ${amountString} ELA from @ElastosGoldTipbot.`
                      );
                    } else {
                      if (senderUser[0].elaAmount > amount) {
                        const receiveUser = {
                          id: receiverUserId,
                          displayName: displayName,
                          userName: user[0].userName,
                          elaAmount: user[0].elaAmount + amount,
                          goldAmount: user[0].goldAmount,
                          uniqueCode: user[0].uniqueCode,
                        };
                        const sendUser = {
                          id: ctx.from.id,
                          displayName: ctx.from.first_name,
                          userName: senderUser[0].userName,
                          elaAmount: senderUser[0].elaAmount - amount,
                          goldAmount: senderUser[0].goldAmount,
                          uniqueCode: senderUser[0].uniqueCode,
                        };
                        await TelUser.findOneAndUpdate(
                          { id: ctx.from.id },
                          sendUser,
                          {
                            useFindAndModify: false,
                          }
                        ).then((data) => {});
                        await TelUser.findOneAndUpdate(
                          { id: receiverUserId },
                          receiveUser,
                          {
                            useFindAndModify: false,
                          }
                        ).then((data) => {});
                        await ctx.reply(
                          `${nickName} received ${amountString} ELA from @ElastosGoldTipbot.`
                        );
                      } else {
                        ctx.reply("You don't have enough ELA.");
                      }
                    }
                  }
                }
              }
            } else {
              ctx.reply("Invalid Input.");
            }
          } else {
            ctx.reply("Invalid Input.");
          }
        } else if (commandParts.length > 2) {
          if (!isNaN(detectFloatWithCommaOrPeriod(commandParts[1])) && parseFloat(detectFloatWithCommaOrPeriod(commandParts[1])) > 0) {
            if (commandParts[2].split("", 1)[0] === "@") {
              if (
                commandParts[2] === "@ElastosTestingBot" ||
                commandParts[2] === "@ElastosGoldTipbot"
              ) {
                ctx.reply(
                  "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot."
                );
              } else {
                const amountString = detectFloatWithCommaOrPeriod(
                  commandParts[1]
                );
                const amount = parseFloat(amountString);
                let decimalLength;
                if (amountString.split(".").length > 1) {
                  const sublength = amountString.split(".")[1];
                  decimalLength = sublength.length;
                } else {
                  decimalLength = 0;
                }
                if (amount > 0 && amount !== null) {
                  if (decimalLength > 12) {
                    ctx.reply("Please tip ELA within 12 decimal.");
                  } else {
                    if (amount < 0.000000000001) {
                      ctx.reply(
                        "Please tip 0.000000000001 Units of ELA/GOLD or more."
                      );
                    } else {
                      if (commandParts[2].split("", 1)[0] === "@") {
                        const userName = commandParts[2].substring(
                          1,
                          commandParts[2].length
                        );
                        const user = await TelUser.find({ userName: userName });
                        const senderUser = await TelUser.find({
                          id: ctx.from.id,
                        });
                        if (user.length === 0) {
                          await TelUser.findOneAndUpdate(
                            { id: senderUser[0].id },
                            { elaAmount: senderUser[0].elaAmount - amount }
                          );
                          const telUser = new TelUser({
                            id: "",
                            userName: userName,
                            displayName: "",
                            elaAmount: amount,
                            goldAmount: 0,
                            uniqueCode: generateUniqueCode(),
                          });
                          telUser.save();

                          await ctx.reply(
                            `@${userName} received ${amountString} ELA from @ElastosGoldTipbot.`
                          );
                        } else {
                          if (user[0].id === senderUser[0].id) {
                            await ctx.reply(
                              `@${userName} received ${amountString} ELA from @ElastosGoldTipbot.`
                            );
                          } else {
                            if (senderUser[0].elaAmount > amount) {
                              const receiveUser = {
                                id: user[0].id,
                                displayName: user[0].displayName,
                                userName: user[0].userName,
                                elaAmount: user[0].elaAmount + amount,
                                goldAmount: user[0].goldAmount,
                                uniqueCode: user[0].uniqueCode,
                              };
                              const sendUser = {
                                id: senderUser[0].id,
                                displayName: senderUser[0].displayName,
                                userName: senderUser[0].userName,
                                elaAmount: senderUser[0].elaAmount - amount,
                                goldAmount: senderUser[0].goldAmount,
                                uniqueCode: senderUser[0].uniqueCode,
                              };
                              await TelUser.findOneAndUpdate(
                                { id: ctx.from.id },
                                sendUser,
                                {
                                  useFindAndModify: false,
                                }
                              ).then((data) => {});
                              await TelUser.findOneAndUpdate(
                                { id: user[0].id },
                                receiveUser,
                                {
                                  useFindAndModify: false,
                                }
                              ).then((data) => {});
                              await ctx.reply(
                                `@${userName} received ${amountString} ELA from @ElastosGoldTipbot.`
                              );
                            } else {
                              ctx.reply("You don't have enough ELA.");
                            }
                          }
                        }
                      } else {
                        ctx.reply("Invalid Input.");
                      }
                    }
                  }
                } else {
                  ctx.reply("Invalid Input.");
                }
              }
            } else {
              const userName =
                ctx.update.message.reply_to_message.from.username;
              const receiverUserId =
                ctx.update.message.reply_to_message.from.id;
              const amountString = detectFloatWithCommaOrPeriod(
                commandParts[1]
              );
              const displayName =
                ctx.update.message.reply_to_message.from.first_name;
              let nickName;
              if (userName === undefined) {
                nickName = ctx.update.message.reply_to_message.from.first_name;
              } else {
                nickName =
                  "@" + ctx.update.message.reply_to_message.from.username;
              }
              const amount = parseFloat(amountString);
              let decimalLength;
              if (amountString.split(".").length > 1) {
                const sublength = amountString.split(".")[1];
                decimalLength = sublength.length;
              } else {
                decimalLength = 0;
              }
              if (amount > 0 && amount !== null) {
                if (decimalLength > 12) {
                  ctx.reply("Please tip ELA within 12 decimal.");
                } else {
                  if (amount < 0.000000000001) {
                    ctx.reply(
                      "Please tip 0.000000000001 Units of ELA/GOLD or more."
                    );
                  } else {
                    const user = await TelUser.find({ id: receiverUserId });
                    const senderUser = await TelUser.find({
                      id: ctx.from.id,
                    });

                    if (user.length === 0) {
                      await TelUser.findOneAndUpdate(
                        { id: senderUser[0].id },
                        { elaAmount: senderUser[0].elaAmount - amount }
                      );
                      let uniqueCode = "";
                      const characters =
                        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
                      for (let i = 0; i < 8; i++) {
                        uniqueCode += characters.charAt(
                          Math.floor(Math.random() * characters.length)
                        );
                      }
                      const telUser = new TelUser({
                        id: receiverUserId,
                        userName: userName,
                        displayName: displayName,
                        elaAmount: amount,
                        goldAmount: 0,
                        uniqueCode: uniqueCode,
                      });
                      telUser.save(telUser);
                      await ctx.reply(
                        `${nickName} received ${amountString} ELA from @ElastosGoldTipbot.`
                      );
                    } else {
                      if (user[0].id === senderUser[0].id) {
                        await ctx.reply(
                          `${nickName} received ${amountString} ELA from @ElastosGoldTipbot.`
                        );
                      } else {
                        if (senderUser[0].elaAmount > amount) {
                          const receiveUser = {
                            id: receiverUserId,
                            displayName: displayName,
                            userName: user[0].userName,
                            elaAmount: user[0].elaAmount + amount,
                            goldAmount: user[0].goldAmount,
                            uniqueCode: user[0].uniqueCode,
                          };
                          const sendUser = {
                            id: ctx.from.id,
                            displayName: ctx.from.first_name,
                            userName: senderUser[0].userName,
                            elaAmount: senderUser[0].elaAmount - amount,
                            goldAmount: senderUser[0].goldAmount,
                            uniqueCode: senderUser[0].uniqueCode,
                          };
                          await TelUser.findOneAndUpdate(
                            { id: ctx.from.id },
                            sendUser,
                            {
                              useFindAndModify: false,
                            }
                          ).then((data) => {});
                          await TelUser.findOneAndUpdate(
                            { id: receiverUserId },
                            receiveUser,
                            {
                              useFindAndModify: false,
                            }
                          ).then((data) => {});
                          await ctx.reply(
                            `${nickName} received ${amountString} ELA from @ElastosGoldTipbot.`
                          );
                        } else {
                          ctx.reply("You don't have enough ELA.");
                        }
                      }
                    }
                  }
                }
              } else {
                ctx.reply("Invalid Input.");
              }
            }
          } else {
            ctx.reply("Invalid Input.");
          }
        }
      }
    } else {
      if (commandParts.length < 3) {
        ctx.reply("Invalid Input.");
      } else {
        if (!isNaN(detectFloatWithCommaOrPeriod(commandParts[1]))) {
          const amountString = detectFloatWithCommaOrPeriod(commandParts[1]);
          const amount = parseFloat(amountString);
          let decimalLength;
          if (amountString.split(".").length > 1) {
            const sublength = amountString.split(".")[1];
            decimalLength = sublength.length;
          } else {
            decimalLength = 0;
          }
          if (amount > 0 && amount !== null) {
            if (decimalLength > 12) {
              ctx.reply("Please tip ELA within 12 decimal.");
            } else {
              if (amount < 0.000000000001) {
                ctx.reply(
                  "Please tip 0.000000000001 Units of ELA/GOLD or more."
                );
              } else {
                if (commandParts[2].split("", 1)[0] === "@") {
                  if (
                    commandParts[2] === "@ElastosTestingBot" ||
                    commandParts[2] === "@ElastosGoldTipbot"
                  ) {
                    ctx.reply(
                      "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot."
                    );
                  } else {
                    const userName = commandParts[2].substring(
                      1,
                      commandParts[2].length
                    );
                    const user = await TelUser.find({ userName: userName });
                    const senderUser = await TelUser.find({
                      id: ctx.from.id,
                    });
                    if (user.length === 0) {
                      await TelUser.findOneAndUpdate(
                        { id: senderUser[0].id },
                        { elaAmount: senderUser[0].elaAmount - amount }
                      );
                      const telUser = new TelUser({
                        id: "",
                        userName: userName,
                        displayName: "",
                        elaAmount: amount,
                        goldAmount: 0,
                        uniqueCode: generateUniqueCode(),
                      });
                      telUser.save();

                      await ctx.reply(
                        `@${userName} received ${amountString} ELA from @ElastosGoldTipbot.`
                      );
                    } else {
                      if (user[0].userName === senderUser[0].userName) {
                        await ctx.reply(
                          `@${userName} received ${amountString} ELA from @ElastosGoldTipbot.`
                        );
                      } else {
                        if (senderUser[0].elaAmount > amount) {
                          const receiveUser = {
                            id: user[0].id,
                            displayName: user[0].displayName,
                            userName: user[0].userName,
                            elaAmount: user[0].elaAmount + amount,
                            goldAmount: user[0].goldAmount,
                            uniqueCode: user[0].uniqueCode,
                          };
                          const sendUser = {
                            id: senderUser[0].id,
                            displayName: senderUser[0].displayName,
                            userName: senderUser[0].userName,
                            elaAmount: senderUser[0].elaAmount - amount,
                            goldAmount: senderUser[0].goldAmount,
                            uniqueCode: senderUser[0].uniqueCode,
                          };
                          await TelUser.findOneAndUpdate(
                            { id: ctx.from.id },
                            sendUser,
                            {
                              useFindAndModify: false,
                            }
                          ).then((data) => {});
                          await TelUser.findOneAndUpdate(
                            { id: user[0].id },
                            receiveUser,
                            {
                              useFindAndModify: false,
                            }
                          ).then((data) => {});
                          await ctx.reply(
                            `@${userName} received ${amountString} ELA from @ElastosGoldTipbot.`
                          );
                        } else {
                          ctx.reply("You don't have enough ELA.");
                        }
                      }
                    }
                  }
                } else {
                  ctx.reply("Invalid Input.");
                }
              }
            }
          } else {
            ctx.reply("Invalid Input.");
          }
        } else {
          ctx.reply("Invalid Input.");
        }
      }
    }
  });

  ////
  bot.command("tiphelp", async (ctx) => {
    ctx.reply(
      "To start tipping use the following command:\n\n/tip(ela/gold/nugget/dust) <amount> <@-handle>"
    );
    setTimeout(() => {
      ctx.reply(
        "If tipping as a reply to someone:\n\n/tip(ela/gold/nugget/dust) <amount>"
      );
    }, 500);
  });
  //////
  bot.command("tipgold", async (ctx) => {
    const inputText = ctx.message.text;
    const commandParts = inputText.split(" ");
    if (commandParts.length < 2) {
      ctx.reply("Invalid Input.");
    } else {
      if (!isNaN(detectFloatWithCommaOrPeriod(commandParts[1]))) {
        const amountString = detectFloatWithCommaOrPeriod(commandParts[1]);
        const amount = parseFloat(amountString);
        let decimalLength;
        if (amountString.split(".").length > 1) {
          const sublength = amountString.split(".")[1];
          decimalLength = sublength.length;
        } else {
          decimalLength = 0;
        }
        if (amount > 0 && amount !== null) {
          if (decimalLength > 12) {
            ctx.reply("Please tip GOLD within 12 decimal.");
          } else {
            const senderUser = await TelUser.find({ id: ctx.from.id });
            if (senderUser[0].goldAmount < amount) {
              ctx.reply("You don't have enough GOLD.");
            } else {
              if (ctx.update.message.reply_to_message) {
                if (ctx.update.message.reply_to_message.from.is_bot === true) {
                  ctx.reply(
                    "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot."
                  );
                } else {
                  const receiverUserId =
                    ctx.update.message.reply_to_message.from.id;
                  const userName =
                    ctx.update.message.reply_to_message.from.username;
                  const displayName =
                    ctx.update.message.reply_to_message.from.first_name;
                  let nickName;
                  if (userName === undefined) {
                    nickName =
                      ctx.update.message.reply_to_message.from.first_name;
                  } else {
                    nickName =
                      "@" + ctx.update.message.reply_to_message.from.username;
                  }
                  const receiveUser = await TelUser.find({
                    id: receiverUserId,
                  });

                  if (receiveUser.length === 0) {
                    await TelUser.findOneAndUpdate(
                      { id: senderUser[0].id },
                      { goldAmount: senderUser[0].goldAmount - amount }
                    );
                    let uniqueCode = "";
                    const characters =
                      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
                    for (let i = 0; i < 8; i++) {
                      uniqueCode += characters.charAt(
                        Math.floor(Math.random() * characters.length)
                      );
                    }
                    const createUser = new TelUser({
                      id: receiverUserId,
                      userName: userName,
                      displayName: displayName,
                      elaAmount: 0,
                      goldAmount: amount,
                      uniqueCode: uniqueCode,
                    });
                    await createUser.save();
                    ctx.reply(
                      `${nickName} received ${amountString} GOLD from @ElastosGoldTipbot`
                    );
                  } else {
                    if (senderUser[0].id === receiveUser[0].id) {
                      ctx.reply(
                        `${nickName} received ${amountString} GOLD from @ElastosGoldTipbot`
                      );
                    } else {
                      const receiverUserTemp = await TelUser.find({
                        id: receiverUserId,
                      });
                      if (commandParts.length < 3) {
                        await TelUser.findOneAndUpdate(
                          { id: senderUser[0].id },
                          { goldAmount: senderUser[0].goldAmount - amount }
                        );
                        await TelUser.findOneAndUpdate(
                          { id: receiverUserId },
                          {
                            goldAmount: receiverUserTemp[0].goldAmount + amount,
                          }
                        );
                        await ctx.reply(
                          `${nickName} received ${amountString} GOLD from @ElastosGoldTipbot`
                        );
                      } else {
                        if (commandParts[2].split("", 1)[0] !== "@") {
                          await TelUser.findOneAndUpdate(
                            { id: senderUser[0].id },
                            { goldAmount: senderUser[0].goldAmount - amount }
                          );
                          await TelUser.findOneAndUpdate(
                            { id: receiverUserId },
                            {
                              goldAmount:
                                receiverUserTemp[0].goldAmount + amount,
                            }
                          );
                          await ctx.reply(
                            `${nickName} received ${amountString} GOLD from @ElastosGoldTipbot`
                          );
                        } else {
                          if (
                            commandParts[2] === "@ElastosTestingBot" ||
                            commandParts[2] === "@ElastosGoldTipbot"
                          ) {
                            ctx.reply(
                              "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot"
                            );
                          } else {
                            const userName = commandParts[2].substring(
                              1,
                              commandParts[2].length
                            );
                            const user = await TelUser.find({
                              userName: userName,
                            });
                            if (user.length === 0) {
                              await TelUser.findOneAndUpdate(
                                { id: senderUser[0].id },
                                {
                                  goldAmount: senderUser[0].goldAmount - amount,
                                }
                              );
                              let uniqueCode = "";
                              const characters =
                                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
                              for (let i = 0; i < 8; i++) {
                                uniqueCode += characters.charAt(
                                  Math.floor(Math.random() * characters.length)
                                );
                              }
                              const createUser = new TelUser({
                                id: "",
                                userName: userName,
                                displayName: "",
                                elaAmount: 0,
                                goldAmount: amount,
                                uniqueCode: uniqueCode,
                              });
                              await createUser.save();
                              ctx.reply(
                                `${nickName} received ${amountString} GOLD from @ElastosGoldTipbot`
                              );
                            } else {
                              const userTemp = await TelUser.find({
                                userName: userName,
                              });
                              await TelUser.findOneAndUpdate(
                                { id: senderUser[0].id },
                                {
                                  goldAmount: senderUser[0].goldAmount - amount,
                                }
                              );
                              await TelUser.findOneAndUpdate(
                                { id: userTemp[0].id },
                                { goldAmount: userTemp[0].goldAmount + amount }
                              );
                              await ctx.reply(
                                `@${userName} received ${amountString} GOLD from @ElastosGoldTipbot`
                              );
                            }
                          }
                        }
                      }
                    }
                  }
                }
              } else {
                if (commandParts.length < 3) {
                  ctx.reply("Invalid Input.");
                } else {
                  if (commandParts[2].split("", 1)[0] !== "@") {
                    ctx.reply("Invalid Input.");
                  } else {
                    if (
                      commandParts[2] === "@ElastosTestingBot" ||
                      commandParts[2] === "@ElastosGoldTipbot"
                    ) {
                      ctx.reply(
                        "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot"
                      );
                    } else {
                      const userName = commandParts[2].substring(
                        1,
                        commandParts[2].length
                      );
                      const user = await TelUser.find({ userName: userName });

                      if (user.length === 0) {
                        await TelUser.findOneAndUpdate(
                          { id: senderUser[0].id },
                          { goldAmount: senderUser[0].goldAmount - amount }
                        );
                        let uniqueCode = "";
                        const characters =
                          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
                        for (let i = 0; i < 8; i++) {
                          uniqueCode += characters.charAt(
                            Math.floor(Math.random() * characters.length)
                          );
                        }
                        const createUser = new TelUser({
                          id: "",
                          userName: userName,
                          displayName: "",
                          elaAmount: 0,
                          goldAmount: amount,
                          uniqueCode: uniqueCode,
                        });
                        await createUser.save();
                        ctx.reply(
                          `@${userName} received ${amountString} GOLD from @ElastosGoldTipbot`
                        );
                      } else {
                        if (senderUser[0].id === user[0].id) {
                          ctx.reply(
                            `@${userName} received ${amountString} GOLD from @ElastosGoldTipbot`
                          );
                        } else {
                          const userTemp = await TelUser.find({
                            userName: userName,
                          });
                          await TelUser.findOneAndUpdate(
                            { id: senderUser[0].id },
                            { goldAmount: senderUser[0].goldAmount - amount }
                          );
                          await TelUser.findOneAndUpdate(
                            { id: userTemp[0].id },
                            { goldAmount: userTemp[0].goldAmount + amount }
                          );
                          await ctx.reply(
                            `@${userName} received ${amountString} GOLD from @ElastosGoldTipbot`
                          );
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        } else {
          ctx.reply("Invalid Input.");
        }
      } else {
        ctx.reply("Invalid Input.");
      }
    }
  });

  /////
  bot.command("tipnugget", async (ctx) => {
    const inputText = ctx.message.text;
    const commandParts = inputText.split(" ");
    if (commandParts.length < 2) {
      if (ctx.update.message.reply_to_message) {
        if (ctx.update.message.reply_to_message.from.is_bot === true) {
          ctx.reply(
            "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot"
          );
        } else {
          const amount = 1 / Math.pow(10, 8);
          const senderUser = await TelUser.find({ id: ctx.from.id });
          if (senderUser[0].goldAmount < amount) {
            ctx.reply("You don't have enough GOLD.");
          } else {
            const receiverUserId = ctx.update.message.reply_to_message.from.id;
            const userName = ctx.update.message.reply_to_message.from.username;
            const displayName =
              ctx.update.message.reply_to_message.from.first_name;
            let nickName;
            if (userName === undefined) {
              nickName = ctx.update.message.reply_to_message.from.first_name;
            } else {
              nickName =
                "@" + ctx.update.message.reply_to_message.from.username;
            }
            const receiveUser = await TelUser.find({ id: receiverUserId });
            const receiverUserTemp = await TelUser.find({
              id: receiverUserId,
            });
            if (senderUser[0].id == receiverUserId) {
              await ctx.reply(
                `${nickName} received 1 NUGGET (GOLD Satoshi) from @ElastosGoldTipbot`
              );
            } else {
              if (receiveUser.length === 0) {
                await createAccount(
                  receiverUserId,
                  userName ? userName : "",
                  displayName
                );
              } else {
                await TelUser.findOneAndUpdate(
                  { id: senderUser[0].id },
                  { goldAmount: senderUser[0].goldAmount - amount }
                );
                await TelUser.findOneAndUpdate(
                  { id: receiverUserId },
                  { goldAmount: receiverUserTemp[0].goldAmount + amount }
                );
                await ctx.reply(
                  `${nickName} received 1 NUGGET (GOLD Satoshi) from @ElastosGoldTipbot`
                );
              }
            }
          }
        }
      } else {
        ctx.reply("Invalid Input.");
      }
    } else {
      if (!isNaN(detectFloatWithCommaOrPeriod(commandParts[1]))) {
        const amountString = detectFloatWithCommaOrPeriod(commandParts[1]);
        const amountEla = parseFloat(amountString);
        let decimalLength;
        if (amountString.split(".").length > 1) {
          const sublength = amountString.split(".")[1];
          decimalLength = sublength.length;
        } else {
          decimalLength = 0;
        }
        if (amountEla > 0 && amountEla !== null) {
          if (decimalLength > 4) {
            ctx.reply("Please tip NUGGET within 4 decimal.");
          } else {
            const amount = amountEla / Math.pow(10, 8);
            const senderUser = await TelUser.find({ id: ctx.from.id });
            if (senderUser[0].goldAmount < amount) {
              ctx.reply("You don't have enough GOLD.");
            } else {
              if (ctx.update.message.reply_to_message) {
                if (ctx.update.message.reply_to_message.from.is_bot === true) {
                  ctx.reply(
                    "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot"
                  );
                } else {
                  const receiverUserId =
                    ctx.update.message.reply_to_message.from.id;
                  const userName =
                    ctx.update.message.reply_to_message.from.username;
                  const displayName =
                    ctx.update.message.reply_to_message.from.first_name;
                  let nickName;
                  if (userName === undefined) {
                    nickName =
                      ctx.update.message.reply_to_message.from.first_name;
                  } else {
                    nickName =
                      "@" + ctx.update.message.reply_to_message.from.username;
                  }
                  const receiveUser = await TelUser.find({
                    id: receiverUserId,
                  });
                  if (receiveUser.length === 0) {
                    await createAccount(
                      receiverUserId,
                      userName ? userName : "",
                      displayName
                    );
                  }
                  const receiverUserTemp = await TelUser.find({
                    id: receiverUserId,
                  });
                  if (commandParts.length < 3) {
                    if (senderUser[0].id == receiverUserId) {
                      await ctx.reply(
                        `${nickName} received ${amountString} NUGGET (GOLD Satoshi) from @ElastosGoldTipbot`
                      );
                    } else {
                      await TelUser.findOneAndUpdate(
                        { id: senderUser[0].id },
                        { goldAmount: senderUser[0].goldAmount - amount }
                      );
                      await TelUser.findOneAndUpdate(
                        { id: receiverUserId },
                        { goldAmount: receiverUserTemp[0].goldAmount + amount }
                      );
                      await ctx.reply(
                        `${nickName} received ${amountString} NUGGET (GOLD Satoshi) from @ElastosGoldTipbot`
                      );
                    }
                  } else {
                    if (commandParts[2].split("", 1)[0] !== "@") {
                      if (senderUser[0].id == receiverUserId) {
                        await ctx.reply(
                          `${nickName} received ${amountString} NUGGET (GOLD Satoshi) from @ElastosGoldTipbot`
                        );
                      } else {
                        if (
                          commandParts[2] === "@ElastosTestingBot" ||
                          commandParts[2] === "@ElastosGoldTipbot"
                        ) {
                          ctx.reply(
                            "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot"
                          );
                        } else {
                          await TelUser.findOneAndUpdate(
                            { id: senderUser[0].id },
                            { goldAmount: senderUser[0].goldAmount - amount }
                          );
                          await TelUser.findOneAndUpdate(
                            { id: receiverUserId },
                            {
                              goldAmount:
                                receiverUserTemp[0].goldAmount + amount,
                            }
                          );
                          await ctx.reply(
                            `${nickName} received ${amountString} NUGGET (GOLD Satoshi) from @ElastosGoldTipbot`
                          );
                        }
                      }
                    } else {
                      if (
                        commandParts[2] === "@ElastosTestingBot" ||
                        commandParts[2] === "@ElastosGoldTipbot"
                      ) {
                        ctx.reply(
                          "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot"
                        );
                      } else {
                        const userName = commandParts[2].substring(
                          1,
                          commandParts[2].length
                        );
                        const user = await TelUser.find({ userName: userName });
                        if (user.length === 0) {
                          await createAccount("", userName, "");
                        }
                        const userTemp = await TelUser.find({
                          userName: userName,
                        });
                        if (userTemp[0].id === senderUser[0].id) {
                          await ctx.reply(
                            `@${userName} received ${amountString} NUGGET (GOLD Satoshi) from @ElastosGoldTipbot`
                          );
                        } else {
                          await TelUser.findOneAndUpdate(
                            { id: senderUser[0].id },
                            { goldAmount: senderUser[0].goldAmount - amount }
                          );
                          await TelUser.findOneAndUpdate(
                            { id: userTemp[0].id },
                            { goldAmount: userTemp[0].goldAmount + amount }
                          );
                          await ctx.reply(
                            `@${userName} received ${amountString} NUGGET (GOLD Satoshi) from @ElastosGoldTipbot`
                          );
                        }
                      }
                    }
                  }
                }
              } else {
                if (commandParts.length < 3) {
                  ctx.reply("Invalid Input.");
                } else {
                  if (commandParts[2].split("", 1)[0] !== "@") {
                    ctx.reply("Invalid Input.");
                  } else {
                    if (
                      commandParts[2] === "@ElastosTestingBot" ||
                      commandParts[2] === "@ElastosGoldTipbot"
                    ) {
                      ctx.reply(
                        "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot"
                      );
                    } else {
                      const userName = commandParts[2].substring(
                        1,
                        commandParts[2].length
                      );
                      const user = await TelUser.find({ userName: userName });
                      if (user.length === 0) {
                        await createAccount("", userName, "");
                      }
                      const userTemp = await TelUser.find({
                        userName: userName,
                      });
                      if (userTemp[0].id === senderUser[0].id) {
                        await ctx.reply(
                          `@${userName} received ${amountString} NUGGET (GOLD Satoshi) from @ElastosGoldTipbot`
                        );
                      } else {
                        await TelUser.findOneAndUpdate(
                          { id: senderUser[0].id },
                          { goldAmount: senderUser[0].goldAmount - amount }
                        );
                        await TelUser.findOneAndUpdate(
                          { id: userTemp[0].id },
                          { goldAmount: userTemp[0].goldAmount + amount }
                        );
                        await ctx.reply(
                          `@${userName} received ${amountString} NUGGET (GOLD Satoshi) from @ElastosGoldTipbot`
                        );
                      }
                    }
                  }
                }
              }
            }
          }
        } else {
          ctx.reply("Invalid Input.");
        }
      } else {
        if (commandParts[1].split("", 1)[0] === "@") {
          if (
            commandParts[1] === "@ElastosTestingBot" ||
            commandParts[1] === "@ElastosGoldTipbot"
          ) {
            ctx.reply(
              "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot"
            );
          } else {
            const senderUser = await TelUser.find({ id: ctx.from.id });
            const amount = 1 / Math.pow(10, 8);
            const userName = commandParts[1].substring(
              1,
              commandParts[1].length
            );
            const user = await TelUser.find({ userName: userName });
            if (user.length === 0) {
              await createAccount("", userName, "");
            }
            const userTemp = await TelUser.find({ userName: userName });
            if (userTemp[0].id === senderUser[0].id) {
              await ctx.reply(
                `@${userName} received 1 NUGGET (GOLD Satoshi) from @ElastosGoldTipbot`
              );
            } else {
              await TelUser.findOneAndUpdate(
                { id: senderUser[0].id },
                { goldAmount: senderUser[0].goldAmount - amount }
              );
              await TelUser.findOneAndUpdate(
                { id: userTemp[0].id },
                { goldAmount: userTemp[0].goldAmount + amount }
              );
              await ctx.reply(
                `@${userName} received 1 NUGGET (GOLD Satoshi) from @ElastosGoldTipbot`
              );
            }
          }
        } else {
          ctx.reply("Invalid Input.");
        }
      }
    }
  });
  /////
  bot.command("tipdust", async (ctx) => {
    const inputText = ctx.message.text;
    const commandParts = inputText.split(" ");
    if (commandParts.length < 2) {
      if (ctx.update.message.reply_to_message) {
        if (ctx.update.message.reply_to_message.from.is_bot === true) {
          ctx.reply(
            "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot"
          );
        } else {
          const amount = 1 / Math.pow(10, 12);
          const senderUser = await TelUser.find({ id: ctx.from.id });
          if (senderUser[0].goldAmount < amount) {
            ctx.reply("You don't have enough GOLD.");
          } else {
            const receiverUserId = ctx.update.message.reply_to_message.from.id;
            const userName = ctx.update.message.reply_to_message.from.username;
            const displayName =
              ctx.update.message.reply_to_message.from.first_name;
            let nickName;
            if (userName === undefined) {
              nickName = ctx.update.message.reply_to_message.from.first_name;
            } else {
              nickName =
                "@" + ctx.update.message.reply_to_message.from.username;
            }
            const receiveUser = await TelUser.find({ id: receiverUserId });
            if (receiveUser.length === 0) {
              await createAccount(
                receiverUserId,
                userName ? userName : "",
                displayName
              );
            }
            const receiverUserTemp = await TelUser.find({
              id: receiverUserId,
            });
            if (senderUser[0].id == receiverUserId) {
              await ctx.reply(
                `${nickName} received 1 DUST (GOLD 12 Decimal) from @ElastosGoldTipbot`
              );
            } else {
              await TelUser.findOneAndUpdate(
                { id: senderUser[0].id },
                { goldAmount: senderUser[0].goldAmount - amount }
              );
              await TelUser.findOneAndUpdate(
                { id: receiverUserId },
                { goldAmount: receiverUserTemp[0].goldAmount + amount }
              );
              await ctx.reply(
                `${nickName} received 1 DUST (GOLD 12 Decimal) from @ElastosGoldTipbot`
              );
            }
          }
        }
      } else {
        ctx.reply("Invalid Input.");
      }
    } else {
      if (!isNaN(detectFloatWithCommaOrPeriod(commandParts[1]))) {
        const amountString = detectFloatWithCommaOrPeriod(commandParts[1]);
        const amountEla = parseFloat(amountString);
        let decimalLength;
        if (amountString.split(".").length > 1) {
          const sublength = amountString.split(".")[1];
          decimalLength = sublength.length;
        } else {
          decimalLength = 0;
        }
        if (amountEla > 0 && amountEla !== null) {
          if (decimalLength > 0) {
            ctx.reply("Please tip DUST using no decimal.");
          } else {
            const amount = amountEla / Math.pow(10, 12);
            const senderUser = await TelUser.find({ id: ctx.from.id });
            if (senderUser[0].goldAmount < amount) {
              ctx.reply("You don't have enough GOLD.");
            } else {
              if (ctx.update.message.reply_to_message) {
                if (ctx.update.message.reply_to_message.from.is_bot === true) {
                  ctx.reply(
                    "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot"
                  );
                } else {
                  const receiverUserId =
                    ctx.update.message.reply_to_message.from.id;
                  const userName =
                    ctx.update.message.reply_to_message.from.username;
                  const displayName =
                    ctx.update.message.reply_to_message.from.first_name;
                  let nickName;
                  if (userName === undefined) {
                    nickName =
                      ctx.update.message.reply_to_message.from.first_name;
                  } else {
                    nickName =
                      "@" + ctx.update.message.reply_to_message.from.username;
                  }
                  const receiveUser = await TelUser.find({
                    id: receiverUserId,
                  });
                  if (receiveUser.length === 0) {
                    await createAccount(
                      receiverUserId,
                      userName ? userName : "",
                      displayName
                    );
                  }
                  const receiverUserTemp = await TelUser.find({
                    id: receiverUserId,
                  });
                  if (commandParts.length < 3) {
                    if (receiverUserId == senderUser[0].id) {
                      await ctx.reply(
                        `${nickName} received ${amountString} DUST (GOLD 12 Decimal) from @ElastosGoldTipbot`
                      );
                    } else {
                      await TelUser.findOneAndUpdate(
                        { id: senderUser[0].id },
                        { goldAmount: senderUser[0].goldAmount - amount }
                      );
                      await TelUser.findOneAndUpdate(
                        { id: receiverUserId },
                        { goldAmount: receiverUserTemp[0].goldAmount + amount }
                      );
                      await ctx.reply(
                        `${nickName} received ${amountString} DUST (GOLD 12 Decimal) from @ElastosGoldTipbot`
                      );
                    }
                  } else {
                    if (commandParts[2].split("", 1)[0] !== "@") {
                      if (receiverUserId === senderUser[0].id) {
                        await ctx.reply(
                          `${nickName} received ${amountString} DUST (GOLD 12 Decimal) from @ElastosGoldTipbot`
                        );
                      } else {
                        if (
                          commandParts[2] === "@ElastosTestingBot" ||
                          commandParts[2] === "@ElastosGoldTipbot"
                        ) {
                          ctx.reply(
                            "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot"
                          );
                        } else {
                          await TelUser.findOneAndUpdate(
                            { id: senderUser[0].id },
                            { goldAmount: senderUser[0].goldAmount - amount }
                          );
                          await TelUser.findOneAndUpdate(
                            { id: receiverUserId },
                            {
                              goldAmount:
                                receiverUserTemp[0].goldAmount + amount,
                            }
                          );
                          await ctx.reply(
                            `${nickName} received ${amountString} DUST (GOLD 12 Decimal) from @ElastosGoldTipbot`
                          );
                        }
                      }
                    } else {
                      if (
                        commandParts[2] === "@ElastosTestingBot" ||
                        commandParts[2] === "@ElastosGoldTipbot"
                      ) {
                        ctx.reply(
                          "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot"
                        );
                      } else {
                        const userName = commandParts[2].substring(
                          1,
                          commandParts[2].length
                        );
                        const user = await TelUser.find({ userName: userName });
                        if (user.length === 0) {
                          await createAccount("", userName, "");
                        }
                        const userTemp = await TelUser.find({
                          userName: userName,
                        });
                        if (userTemp[0].id === senderUser[0].id) {
                          await ctx.reply(
                            `@${userName} received ${amountString} DUST (GOLD 12 Decimal) from @ElastosGoldTipbot`
                          );
                        } else {
                          await TelUser.findOneAndUpdate(
                            { id: senderUser[0].id },
                            { goldAmount: senderUser[0].goldAmount - amount }
                          );
                          await TelUser.findOneAndUpdate(
                            { id: userTemp[0].id },
                            { goldAmount: userTemp[0].goldAmount + amount }
                          );
                          await ctx.reply(
                            `@${userName} received ${amountString} DUST (GOLD 12 Decimal) from @ElastosGoldTipbot`
                          );
                        }
                      }
                    }
                  }
                }
              } else {
                if (commandParts.length < 3) {
                  ctx.reply("Invalid Input.");
                } else {
                  if (commandParts[2].split("", 1)[0] !== "@") {
                    ctx.reply("Invalid Input.");
                  } else {
                    if (
                      commandParts[2] === "@ElastosTestingBot" ||
                      commandParts[2] === "@ElastosGoldTipbot"
                    ) {
                      ctx.reply(
                        "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot"
                      );
                    } else {
                      const userName = commandParts[2].substring(
                        1,
                        commandParts[2].length
                      );
                      const user = await TelUser.find({ userName: userName });
                      if (user.length === 0) {
                        await createAccount("", userName, "");
                      }
                      const userTemp = await TelUser.find({
                        userName: userName,
                      });
                      if (userTemp[0].id === senderUser[0].id) {
                        await ctx.reply(
                          `@${userName} received ${amountString} DUST (GOLD 12 Decimal) from @ElastosGoldTipbot`
                        );
                      } else {
                        await TelUser.findOneAndUpdate(
                          { id: senderUser[0].id },
                          { goldAmount: senderUser[0].goldAmount - amount }
                        );
                        await TelUser.findOneAndUpdate(
                          { id: userTemp[0].id },
                          { goldAmount: userTemp[0].goldAmount + amount }
                        );
                        await ctx.reply(
                          `@${userName} received ${amountString} DUST (GOLD 12 Decimal) from @ElastosGoldTipbot`
                        );
                      }
                    }
                  }
                }
              }
            }
          }
        } else {
          ctx.reply("Invalid Input.");
        }
      } else {
        if (commandParts[1].split("", 1)[0] === "@") {
          if (
            commandParts[1] === "@ElastosTestingBot" ||
            commandParts[1] === "@ElastosGoldTipbot"
          ) {
            ctx.reply(
              "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot"
            );
          } else {
            const senderUser = await TelUser.find({ id: ctx.from.id });
            const amount = 1 / Math.pow(10, 12);
            const userName = commandParts[1].substring(
              1,
              commandParts[1].length
            );
            const user = await TelUser.find({ userName: userName });
            if (user.length === 0) {
              await createAccount("", userName, "");
            }
            const userTemp = await TelUser.find({ userName: userName });
            if (userTemp[0].id === senderUser[0].id) {
              await ctx.reply(
                `@${userName} received 1 DUST (GOLD 12 Decimal) from @ElastosGoldTipbot`
              );
            } else {
              await TelUser.findOneAndUpdate(
                { id: senderUser[0].id },
                { goldAmount: senderUser[0].goldAmount - amount }
              );
              await TelUser.findOneAndUpdate(
                { id: userTemp[0].id },
                { goldAmount: userTemp[0].goldAmount + amount }
              );
              await ctx.reply(
                `@${userName} received 1 DUST (GOLD 12 Decimal) from @ElastosGoldTipbot`
              );
            }
          }
        } else {
          ctx.reply("Invalid Input.");
        }
      }
    }
  });

  ////////////
  bot.on("text", async (ctx) => {
    const inputText = ctx.message.text;
    const commandParts = inputText.split(" ");
    let tipCounter = 0;
    let tipPosition = [];
    for (let i = 0; i < commandParts.length; i++) {
      if (commandParts[i].substring(0, 4) === "/tip") {
        tipCounter++;
        tipPosition.push(i);
      }
    }
    if (tipCounter > 1) {
      ctx.reply("Only one tip per message.");
    } else {
      if (tipPosition[0] > 0) {
        const sender = await TelUser.find({ id: ctx.from.id });
        if (sender[0].goldAmount < 1 / Math.pow(10, 12)) {
          await ctx.reply("You don't have enough Gold");
        } else {
          const unit = commandParts[tipPosition[0]].substring(
            4,
            commandParts[tipPosition[0]].length
          );
          if (ctx.update.message.reply_to_message) {
            const receiver = await TelUser.find({
              id: ctx.update.message.reply_to_message.from.id,
            });
            let nickName = "";
            if (ctx.update.message.reply_to_message.from.username) {
              nickName =
                "@" + ctx.update.message.reply_to_message.from.username;
            } else {
              nickName =
                "@" + ctx.update.message.reply_to_message.from.first_name;
            }
            if (receiver.length === 0) {
              const newReceiver = new TelUser({
                id: ctx.update.message.reply_to_message.from.id,
                userName: ctx.update.message.reply_to_message.from.username,
                displayName:
                  ctx.update.message.reply_to_message.from.first_name,
                uniqueCode: generateUniqueCode(),
                goldAmount: 1 / Math.pow(10, 12),
                elaAmount: 0,
              });
              await newReceiver.save();
              await TelUser.findOneAndUpdate(
                { id: sender[0].id },
                { goldAmount: sender[0].goldAmount - 1 / Math.pow(10, 12) }
              );
              await ctx.reply(
                `${nickName} received ${detectFloatWithCommaOrPeriod(
                  commandParts[tipPosition[0] + 1]
                )} ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
              );
            } else {
              if (ctx.update.message.reply_to_message.from.id === ctx.from.id) {
                if (
                  !isNaN(
                    detectFloatWithCommaOrPeriod(
                      commandParts[tipPosition[0] + 1]
                    )
                  ) 
                ) {
                  await ctx.reply(
                    `@${
                      ctx.update.message.reply_to_message.from.username
                    } received ${detectFloatWithCommaOrPeriod(
                      commandParts[tipPosition[0] + 1]
                    )} ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                  );
                  
                } else {
                  await ctx.reply(
                    `@${ctx.update.message.reply_to_message.from.username} received ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                  );
                }
              } else if (
                ctx.update.message.reply_to_message.from.is_bot === true
              ) {
                ctx.reply(
                  "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot"
                );
              } else {
                await TelUser.findOneAndUpdate(
                  { id: ctx.from.id },
                  { goldAmount: sender[0].goldAmount - 1 / Math.pow(10, 12) }
                );
                await TelUser.findOneAndUpdate(
                  { id: ctx.update.message.reply_to_message.from.id },
                  { goldAmount: receiver[0].goldAmount + 1 / Math.pow(10, 12) }
                );
                if (
                  !isNaN(
                    detectFloatWithCommaOrPeriod(
                      commandParts[tipPosition[0] + 1]
                    )
                  )
                ) {
                  await ctx.reply(
                    `${nickName} received ${detectFloatWithCommaOrPeriod(
                      commandParts[tipPosition[0] + 1]
                    )} ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                  );
                } else {
                  await ctx.reply(
                    `${nickName} received ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                  );
                }
              }
            }
          } else {
            if (commandParts.length < tipPosition[0] + 2) {
              await ctx.reply("Invalid Input.");
            } else {
              if (
                !isNaN(
                  detectFloatWithCommaOrPeriod(commandParts[tipPosition[0] + 1])
                )
              ) {
                if (commandParts[tipPosition[0] + 2].split("", 1)[0] === "@") {
                  if (
                    commandParts[tipPosition[0] + 2] === "@ElastosTestingBot" ||
                    commandParts[tipPosition[0] + 2] === "@ElastosGoldTipbot"
                  ) {
                    await ctx.reply(
                      "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot"
                    );
                  } else {
                    const userName = commandParts[tipPosition[0]+2].substring(
                      1,
                      commandParts[tipPosition[0]+2].length
                    );
                    const receiver = await TelUser.find({ userName: userName });
                    if (receiver.length === 0) {
                      const newUser = new TelUser({
                        id: "",
                        userName: userName,
                        displayName: "",
                        elaAmount: 0,
                        goldAmount: 1 / Math.pow(10, 12),
                        uniqueCode: generateUniqueCode(),
                      });
                      await newUser.save();
                      await TelUser.find(
                        { id: sender[0].id },
                        {
                          goldAmount:
                            sender[0].goldAmount - 1 / Math.pow(10, 12),
                        }
                      );
                      await ctx.reply(
                        `@${userName} received ${detectFloatWithCommaOrPeriod(
                          commandParts[tipPosition[0] + 1]
                        )} ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                      );
                    } else {
                      if (sender[0].id === receiver[0].id) {
                        await ctx.reply(
                          `@${userName} received ${detectFloatWithCommaOrPeriod(
                            commandParts[tipPosition[0] + 1]
                          )} ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                        );
                      } else {
                        await TelUser.findOneAndUpdate(
                          { id: sender[0].id },
                          {
                            goldAmount:
                              sender[0].goldAmount - 1 / Math.pow(10, 12),
                          }
                        );
                        await TelUser.findOneAndUpdate(
                          { id: receiver[0].id },
                          {
                            goldAmount:
                              receiver[0].goldAmount + 1 / Math.pow(10, 12),
                          }
                        );
                        await ctx.reply(
                          `@${userName} received ${detectFloatWithCommaOrPeriod(
                            commandParts[tipPosition[0] + 1]
                          )} ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                        );
                      }
                    }
                  }
                }
              } else {
                if (commandParts[tipPosition[0] + 1].split("", 1)[0] === "@") {
                  if (
                    commandParts[tipPosition[0] + 1] === "@ElastosTestingBot" ||
                    commandParts[tipPosition[0] + 1] === "@ElastosGoldTipbot"
                  ) {
                    await ctx.reply(
                      "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot"
                    );
                  } else {
                    const userName = commandParts[tipPosition[0]+1].substring(
                      1,
                      commandParts[tipPosition[0]+1].length
                    );
                    const receiver = await TelUser.find({ userName: userName });
                    if (receiver.length === 0) {
                      const newUser = new TelUser({
                        id: "",
                        userName: userName,
                        displayName: "",
                        elaAmount: 0,
                        goldAmount: 1 / Math.pow(10, 12),
                        uniqueCode: generateUniqueCode(),
                      });
                      await newUser.save();
                      await TelUser.find(
                        { id: sender[0].id },
                        {
                          goldAmount:
                            sender[0].goldAmount - 1 / Math.pow(10, 12),
                        }
                      );
                      await ctx.reply(
                        `@${userName} received ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                      );
                    } else {
                      if (sender[0].id === receiver[0].id) {
                        await ctx.reply(
                          `@${userName} received ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                        );
                      } else {
                        await TelUser.findOneAndUpdate(
                          { id: sender[0].id },
                          {
                            goldAmount:
                              sender[0].goldAmount - 1 / Math.pow(10, 12),
                          }
                        );
                        await TelUser.findOneAndUpdate(
                          { id: receiver[0].id },
                          {
                            goldAmount:
                              receiver[0].goldAmount + 1 / Math.pow(10, 12),
                          }
                        );
                        await ctx.reply(
                          `@${userName} received ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                        );
                      }
                    }
                  }
                } else {
                  ctx.reply("Invalid Input.")
                }
              }
            }
          }
        }
      } else if (commandParts[0].substring(0, 4) === "/tip") {
        const unit = commandParts[0].substring(4, commandParts[0].length);
        const sender = await TelUser.find({ id: ctx.from.id });
        if (sender.length === 0) {
          await createAccount(
            ctx.from.id,
            ctx.from.username,
            ctx.from.first_name
          );
          await ctx.reply("You don't have enough Gold");
        } else {
          if (sender[0].goldAmount < 1 / Math.pow(10, 12)) {
            await ctx.reply("You don't have enough Gold");
          } else {
            if (ctx.update.message.reply_to_message) {
              if (ctx.update.message.reply_to_message.from.is_bot === true) {
                ctx.reply(
                  "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot"
                );
              } else {
                const receiver = await TelUser.find({
                  id: ctx.update.message.reply_to_message.from.id,
                });
                if (receiver.length === 0) {
                  let uniqueCode = "";
                  const characters =
                    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
                  for (let i = 0; i < 8; i++) {
                    uniqueCode += characters.charAt(
                      Math.floor(Math.random() * characters.length)
                    );
                  }
                  const newUser = new TelUser({
                    id: ctx.update.message.reply_to_message.from.id,
                    userName: ctx.update.message.reply_to_message.from.username
                      ? ctx.update.message.reply_to_message.from.username
                      : "",
                    displayName:
                      ctx.update.message.reply_to_message.from.first_name,
                    elaAmount: 0,
                    goldAmount: 1 / Math.pow(10, 12),
                    uniqueCode: uniqueCode,
                  });
                  await newUser.save();
                  await TelUser.find(
                    { id: sender[0].id },
                    { goldAmount: sender[0].goldAmount - 1 / Math.pow(10, 12) }
                  );
                  await ctx.reply(
                    `@${ctx.update.message.reply_to_message.from.username} received ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                  );
                } else {
                  if (commandParts.length === 1) {
                    if (
                      ctx.from.id ===
                      ctx.update.message.reply_to_message.from.id
                    ) {
                      await ctx.reply(
                        `@${ctx.update.message.reply_to_message.from.username} received ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                      );
                    } else {
                      await TelUser.findOneAndUpdate(
                        { id: ctx.from.id },
                        {
                          goldAmount:
                            sender[0].goldAmount - 1 / Math.pow(10, 12),
                        }
                      );
                      await TelUser.findOneAndUpdate(
                        { id: ctx.update.message.reply_to_message.from.id },
                        {
                          goldAmount:
                            receiver[0].goldAmount + 1 / Math.pow(10, 12),
                        }
                      );
                      if (ctx.update.message.reply_to_message.from.username) {
                        await ctx.reply(
                          `@${ctx.update.message.reply_to_message.from.username} received ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                        );
                      } else {
                        await ctx.reply(
                          `@${ctx.update.message.reply_to_message.from.first_name} received ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                        );
                      }
                    }
                  } else {
                    if (commandParts.length === 2) {
                      if (
                        !isNaN(detectFloatWithCommaOrPeriod(commandParts[1])) && parseFloat(detectFloatWithCommaOrPeriod(commandParts[1])) > 0
                      ) {
                        if (
                          ctx.from.id ===
                          ctx.update.message.reply_to_message.from.id
                        ) {
                          await ctx.reply(
                            `@${
                              ctx.update.message.reply_to_message.from.username
                            } received ${detectFloatWithCommaOrPeriod(
                              commandParts[1]
                            )} ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                          );
                        } else {
                          await TelUser.findOneAndUpdate(
                            { id: ctx.from.id },
                            {
                              goldAmount:
                                sender[0].goldAmount - 1 / Math.pow(10, 12),
                            }
                          );
                          await TelUser.findOneAndUpdate(
                            { id: ctx.update.message.reply_to_message.from.id },
                            {
                              goldAmount:
                                receiver[0].goldAmount + 1 / Math.pow(10, 12),
                            }
                          );
                          await ctx.reply(
                            `@${
                              ctx.update.message.reply_to_message.from.username
                            } received ${detectFloatWithCommaOrPeriod(
                              commandParts[1]
                            )} ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                          );
                        }
                      } else {
                        if (commandParts[1].split("", 1)[0] === "@") {
                          if (
                            commandParts[1] === "@ElastosTestingBot" ||
                            commandParts[1] === "@ElastosGoldTipbot"
                          ) {
                            ctx.reply(
                              "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot"
                            );
                          } else {
                            const userName = commandParts[1].substring(
                              1,
                              commandParts[1].length
                            );
                            const receiptUser = await TelUser.find({
                              userName: userName,
                            });
                            if (receiptUser.length === 0) {
                              const newUser = new TelUser({
                                id: "",
                                userName: userName,
                                displayName: "",
                                elaAmount: 0,
                                goldAmount: 1 / Math.pow(10, 12),
                                uniqueCode: generateUniqueCode(),
                              });
                              await newUser.save();
                              await TelUser.findOneAndUpdate(
                                { id: sender[0].id },
                                {
                                  goldAmount:
                                    sender[0].goldAmount - 1 / Math.pow(10, 12),
                                }
                              );
                            } else {
                              if (sender[0].id === receiptUser[0].id) {
                              } else {
                                await TelUser.findOneAndUpdate(
                                  { id: sender[0].id },
                                  {
                                    goldAmount:
                                      sender[0].goldAmount -
                                      1 / Math.pow(10, 12),
                                  }
                                );
                                await TelUser.findOneAndUpdate(
                                  { userName: userName },
                                  {
                                    goldAmount:
                                      receiptUser[0].goldAmount +
                                      1 / Math.pow(10, 12),
                                  }
                                );
                              }
                            }
                            await ctx.reply(
                              `@${userName} received ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                            );
                          }
                        } else {
                          if (
                            ctx.from.id ===
                            ctx.update.message.reply_to_message.from.id
                          ) {
                            await ctx.reply(
                              `@${ctx.update.message.reply_to_message.from.username} received ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                            );
                          } else {
                            await TelUser.findOneAndUpdate(
                              { id: ctx.from.id },
                              {
                                goldAmount:
                                  sender[0].goldAmount - 1 / Math.pow(10, 12),
                              }
                            );
                            await TelUser.findOneAndUpdate(
                              {
                                id: ctx.update.message.reply_to_message.from.id,
                              },
                              {
                                goldAmount:
                                  receiver[0].goldAmount + 1 / Math.pow(10, 12),
                              }
                            );
                            if (
                              ctx.update.message.reply_to_message.from.username
                            ) {
                              await ctx.reply(
                                `@${ctx.update.message.reply_to_message.from.username} received ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                              );
                            } else {
                              await ctx.reply(
                                `@${ctx.update.message.reply_to_message.from.first_name} received ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                              );
                            }
                          }
                        }
                      }
                    } else {
                      if (
                        !isNaN(detectFloatWithCommaOrPeriod(commandParts[1])) && parseFloat(detectFloatWithCommaOrPeriod(commandParts[1])) > 0
                      ) {
                        if (commandParts[2].split("", 1)[0] === "@") {
                          if (
                            commandParts[2] === "@ElastosTestingBot" ||
                            commandParts[2] === "@ElastosGoldTipbot"
                          ) {
                            ctx.reply(
                              "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot"
                            );
                          } else {
                            const userName = commandParts[2].substring(
                              1,
                              commandParts[2].length
                            );
                            const receiptUser = await TelUser.find({
                              userName: userName,
                            });
                            if (receiptUser.length === 0) {
                              const newUser = new TelUser({
                                id: "",
                                userName: userName,
                                displayName: "",
                                elaAmount: 0,
                                goldAmount: 1 / Math.pow(10, 12),
                                uniqueCode: generateUniqueCode(),
                              });
                              await newUser.save();
                              await TelUser.findOneAndUpdate(
                                { id: sender[0].id },
                                {
                                  goldAmount:
                                    sender[0].goldAmount - 1 / Math.pow(10, 12),
                                }
                              );
                            } else {
                              if (sender[0].id === receiptUser[0].id) {
                              } else {
                                await TelUser.findOneAndUpdate(
                                  { id: sender[0].id },
                                  {
                                    goldAmount:
                                      sender[0].goldAmount -
                                      1 / Math.pow(10, 12),
                                  }
                                );
                                await TelUser.findOneAndUpdate(
                                  { userName: userName },
                                  {
                                    goldAmount:
                                      receiptUser[0].goldAmount +
                                      1 / Math.pow(10, 12),
                                  }
                                );
                              }
                            }
                            await ctx.reply(
                              `${
                                commandParts[2]
                              } received ${detectFloatWithCommaOrPeriod(
                                commandParts[1]
                              )} ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                            );
                          }
                        } else {
                          if (
                            ctx.from.id ===
                            ctx.update.message.reply_to_message.from.id
                          ) {
                            await ctx.reply(
                              `@${ctx.update.message.reply_to_message.from.username} received ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                            );
                          } else {
                            await TelUser.findOneAndUpdate(
                              { id: ctx.from.id },
                              {
                                goldAmount:
                                  sender[0].goldAmount - 1 / Math.pow(10, 12),
                              }
                            );
                            await TelUser.findOneAndUpdate(
                              {
                                id: ctx.update.message.reply_to_message.from.id,
                              },
                              {
                                goldAmount:
                                  receiver[0].goldAmount + 1 / Math.pow(10, 12),
                              }
                            );
                            if (
                              ctx.update.message.reply_to_message.from.username
                            ) {
                              await ctx.reply(
                                `@${
                                  ctx.update.message.reply_to_message.from
                                    .username
                                } received ${detectFloatWithCommaOrPeriod(
                                  commandParts[1]
                                )} ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                              );
                            } else {
                              await ctx.reply(
                                `@${
                                  ctx.update.message.reply_to_message.from
                                    .first_name
                                } received ${detectFloatWithCommaOrPeriod(
                                  commandParts[1]
                                )} ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                              );
                            }
                          }
                        }
                      } else {
                        ctx.reply("Invalid Input.");
                      }
                    }
                  }
                }
              }
            } else {
              if (commandParts.length > 2) {
                if (!isNaN(detectFloatWithCommaOrPeriod(commandParts[1]))) {
                  if (
                    parseFloat(detectFloatWithCommaOrPeriod(commandParts[1])) >
                    0
                  ) {
                    if (commandParts[2].split("", 1)[0] === "@") {
                      if (
                        commandParts[2] === "@ElastosTestingBot" ||
                        commandParts[2] === "@ElastosGoldTipbot"
                      ) {
                        ctx.reply(
                          "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot"
                        );
                      } else {
                        const userName = commandParts[2].substring(
                          1,
                          commandParts[2].length
                        );
                        const receiptUser = await TelUser.find({
                          userName: userName,
                        });
                        if (receiptUser.length === 0) {
                          const newUser = new TelUser({
                            id: "",
                            userName: userName,
                            displayName: "",
                            elaAmount: 0,
                            goldAmount: 1 / Math.pow(10, 12),
                            uniqueCode: generateUniqueCode(),
                          });
                          await newUser.save();
                          await TelUser.findOneAndUpdate(
                            { id: sender[0].id },
                            {
                              goldAmount:
                                sender[0].goldAmount - 1 / Math.pow(10, 12),
                            }
                          );
                        } else {
                          if (receiptUser[0].id === sender[0].id) {
                          } else {
                            await TelUser.findOneAndUpdate(
                              { id: sender[0].id },
                              {
                                goldAmount:
                                  sender[0].goldAmount - 1 / Math.pow(10, 12),
                              }
                            );
                            await TelUser.findOneAndUpdate(
                              { userName: userName },
                              {
                                goldAmount:
                                  receiptUser[0].goldAmount +
                                  1 / Math.pow(10, 12),
                              }
                            );
                          }
                        }
                        await ctx.reply(
                          `${
                            commandParts[2]
                          } received ${detectFloatWithCommaOrPeriod(
                            commandParts[1]
                          )} ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                        );
                      }
                    } else {
                      ctx.reply("Invalid Input.");
                    }
                  } else {
                    ctx.reply("Invalid Input.");
                  }
                } else {
                  if (commandParts[1].split("", 1)[0] === "@") {
                    if (
                      commandParts[1] === "@ElastosTestingBot" ||
                      commandParts[1] === "@ElastosGoldTipbot"
                    ) {
                      ctx.reply(
                        "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot"
                      );
                    } else {
                      const userName = commandParts[1].substring(
                        1,
                        commandParts[1].length
                      );
                      const receiptUser = await TelUser.find({
                        userName: userName,
                      });
                      if (receiptUser.length === 0) {
                        const newUser = new TelUser({
                          id: "",
                          userName: userName,
                          displayName: "",
                          elaAmount: 0,
                          goldAmount: 1 / Math.pow(10, 12),
                          uniqueCode: generateUniqueCode(),
                        });
                        await newUser.save();
                        await TelUser.findOneAndUpdate(
                          { id: sender[0].id },
                          {
                            goldAmount:
                              sender[0].goldAmount - 1 / Math.pow(10, 12),
                          }
                        );
                      } else {
                        if (sender[0].id === receiptUser[0].id) {
                        } else {
                          await TelUser.findOneAndUpdate(
                            { id: sender[0].id },
                            {
                              goldAmount:
                                sender[0].goldAmount - 1 / Math.pow(10, 12),
                            }
                          );
                          await TelUser.findOneAndUpdate(
                            { userName: userName },
                            {
                              goldAmount:
                                receiptUser[0].goldAmount +
                                1 / Math.pow(10, 12),
                            }
                          );
                        }
                      }
                      await ctx.reply(
                        `@${userName} received ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                      );
                    }
                  } else {
                    ctx.reply("Invalid Input.");
                  }
                }
              } else if (commandParts.length === 2) {
                if (commandParts[1].split("", 1)[0] === "@") {
                  if (
                    commandParts[1] === "@ElastosTestingBot" ||
                    commandParts[1] === "@ElastosGoldTipbot"
                  ) {
                    ctx.reply(
                      "The bot does not need money. He is already rich in wisdom!\n\nWisdom of the day: BUY GOLD! BUY GOLD! BUY GOLD!\n(Not financial advise)\n\n~ElastosGoldTipbot"
                    );
                  } else {
                    const userName = commandParts[1].substring(
                      1,
                      commandParts[1].length
                    );
                    const receiptUser = await TelUser.find({
                      userName: userName,
                    });
                    if (receiptUser.length === 0) {
                      const newUser = new TelUser({
                        id: "",
                        userName: userName,
                        displayName: "",
                        elaAmount: 0,
                        goldAmount: 1 / Math.pow(10, 12),
                        uniqueCode: generateUniqueCode(),
                      });
                      await newUser.save();
                      await TelUser.findOneAndUpdate(
                        { id: sender[0].id },
                        {
                          goldAmount:
                            sender[0].goldAmount - 1 / Math.pow(10, 12),
                        }
                      );
                    } else {
                      if (sender[0].id === receiptUser[0].id) {
                      } else {
                        await TelUser.findOneAndUpdate(
                          { id: sender[0].id },
                          {
                            goldAmount:
                              sender[0].goldAmount - 1 / Math.pow(10, 12),
                          }
                        );
                        await TelUser.findOneAndUpdate(
                          { userName: userName },
                          {
                            goldAmount:
                              receiptUser[0].goldAmount + 1 / Math.pow(10, 12),
                          }
                        );
                      }
                    }
                    await ctx.reply(
                      `@${userName} received ${unit} (1 GOLD DUST) from @elastosgoldtipbot`
                    );
                  }
                } else {
                  ctx.reply("Invalid Input.");
                }
              } else {
                ctx.reply("Invalid Input.");
              }
            }
          }
        }
      } else {
        if (ctx.chat.title) {
          return;
        } else {
          const inputText = ctx.message.text;
          const commandParts = inputText.split(" ");
          const transactionHashRegex = /^0x([A-Fa-f0-9]{64})$/;
          if (transactionHashRegex.test(commandParts[0])) {
            if (commandParts.length < 2) {
              const user = await TelUser.find({ id: ctx.from.id });
              setTimeout(() => {
                ctx.reply(
                  "Please copy paste the transaction ID, followed by this password, separated with a space."
                );
              }, 400);
              setTimeout(() => {
                ctx.reply(user[0].uniqueCode);
              }, 800);
            } else {
              const user = await TelUser.find({ id: ctx.from.id });
              if (user[0].uniqueCode !== commandParts[1]) {
                ctx.reply("Your password is incorrect");
              } else {
                const data = await Tx.find({ tx: commandParts[0] });
                if (data.length == 0) {
                  const response = await axios.post(
                    `https://esc.elastos.io/api/?module=transaction&action=gettxinfo&txhash=${commandParts[0]}`
                  );
                  let token = "";
                  if (response.data.result.logs.length == 0) {
                    token = "ela";
                  } else {
                    if (
                      response.data.result.logs[0].address ==
                      "0xaa9691bce68ee83de7b518dfcbbfb62c04b1c0ba"
                    ) {
                      token = "gold";
                    }
                  }
                  const tx = new Tx({
                    from: response.data.result.from,
                    to: response.data.result.to,
                    token: token,
                    tx: commandParts[0],
                  });
                  await tx.save(tx);
                  const user = await TelUser.find({ id: ctx.from.id });
                  if (token == "ela") {
                    const telUser = {
                      id: ctx.from.id,
                      displayName: ctx.from.first_name,
                      userName: ctx.from.username,
                      elaAmount:
                        user[0].elaAmount +
                        parseFloat(response.data.result.value) /
                          Math.pow(10, 12),
                      goldAmount: user[0].goldAmount,
                    };
                    TelUser.findOneAndUpdate({ id: ctx.from.id }, telUser, {
                      useFindAndModify: false,
                    }).then((data) => {
                      ctx.reply("Transaction completed");
                      setTimeout(() => {
                        ctx.reply(
                          `Old balance:\nELA: ${parseFloat(
                            user[0].elaAmount.toFixed(12).toString()
                          )}\nGOLD: ${parseFloat(
                            user[0].goldAmount.toFixed(12).toString()
                          )}`
                        );
                      }, 400);
                      setTimeout(() => {
                        ctx.reply(
                          `New balance:\nELA: ${parseFloat(
                            telUser.elaAmount.toFixed(12).toString()
                          )}\nGOLD: ${parseFloat(
                            telUser.goldAmount.toFixed(12).toString()
                          )}`
                        );
                      }, 800);
                    });
                  } else if (token == "gold") {
                    const transferData = await axios.get(
                      `https://esc.elastos.io/tx/${commandParts[0]}/token-transfers?type=JSON`
                    );
                    const htmlContent = transferData.data.items[0];
                    const regexResult =
                      /<span class="tile-title">\n\n(.*?)\n <a data-test="token_link" href="\/token\/.*?">(.*?)<\/a>\n\n/.exec(
                        htmlContent
                      );
                    const amount = regexResult[1];
                    const telUser = {
                      id: ctx.from.id,
                      displayName: ctx.from.first_name,
                      userName: ctx.from.username,
                      elaAmount: user[0].elaAmount,
                      goldAmount: user[0].goldAmount + parseFloat(amount),
                    };
                    TelUser.findOneAndUpdate({ id: ctx.from.id }, telUser, {
                      useFindAndModify: false,
                    }).then((data) => {
                      ctx.reply("Transaction completed");
                      setTimeout(() => {
                        ctx.reply(
                          `Old balance:\nELA: ${parseFloat(
                            user[0].elaAmount.toFixed(12).toString()
                          )}\nGOLD: ${parseFloat(
                            user[0].goldAmount.toFixed(12).toString()
                          )}`
                        );
                      }, 400);
                      setTimeout(() => {
                        ctx.reply(
                          `New balance:\nELA: ${parseFloat(
                            telUser.elaAmount.toFixed(12).toString()
                          )}\nGOLD: ${parseFloat(
                            telUser.goldAmount.toFixed(12).toString()
                          )}`
                        );
                      }, 800);
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  });
};
const calculateDecimal = (amount) => {
  let decimalValue = amount.toString().indexOf(".");
  return amount.toString().substring(decimalValue).length - 1;
};
const generateUniqueCode = () => {
  let uniqueCode = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 8; i++) {
    uniqueCode += characters.charAt(
      Math.floor(Math.random() * characters.length)
    );
  }
  return uniqueCode;
};
const createAccount = (id, userName, displayName) =>
  new Promise(async (resolve, reject) => {
    let uniqueCode = "";
    const characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 8; i++) {
      uniqueCode += characters.charAt(
        Math.floor(Math.random() * characters.length)
      );
    }
    const telUser = new TelUser({
      id: id,
      userName: userName,
      displayName: displayName,
      elaAmount: 0,
      goldAmount: 0,
      uniqueCode: uniqueCode,
    });
    telUser
      .save(telUser)
      .then((data) => {
        return resolve("success");
      })
      .catch((err) => {
        return reject("error");
      });
  });

const randomId = (decimal) => {
  let uniqueCode = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < decimal; i++) {
    uniqueCode += characters.charAt(
      Math.floor(Math.random() * characters.length)
    );
  }
  return uniqueCode;
};

function detectFloatWithCommaOrPeriod(value) {
  if (/^-?\d+(,\d+|\.\d+)?$/.test(value)) {
    value = value.replace(",", ".");
    return value;
  } else if (/^-?\d+(\.\d+)?,\d+$/.test(value)) {
    value = value.replace(".", "");
    value = value.replace(",", ".");
    return value;
  } else if (/(,\d+|\.\d+)?$/.test(value)) {
    value = "0" + value.replace(",", ".");
    return value;
  } else if (/(\.\d+)?,\d+$/.test(value)) {
    value = "0" + value.replace(".", "");
    value = "0" + value.replace(",", ".");
    return value;
  } else return null;
}
