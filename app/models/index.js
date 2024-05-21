const dbConfig = require("../config/db.config.js");

const mongoose = require("mongoose");
mongoose.Promise = global.Promise;

const db = {};
db.mongoose = mongoose;
db.url = dbConfig.url;
db.wallets = require("./wallet.model.js")(mongoose);
db.telusers = require("./telusers.model.js")(mongoose);
db.txs = require("./tx.model.js")(mongoose);
module.exports = db;
