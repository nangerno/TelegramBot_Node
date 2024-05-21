bot.command("this", async(ctx) => {
    setTimeout(() => {
      ctx.reply(
        `This is my wallet address:`
      );
    }, 5000);
    setTimeout(() => {
      ctx.reply(
        `${process.env.BOT_PUBLIC_KEY}`
      );
    }, 6000);
})