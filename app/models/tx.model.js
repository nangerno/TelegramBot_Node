module.exports = mongoose => {
    var schema = mongoose.Schema(
      {
        from: String,
        to: String,
        token: String,
        tx:String,
      },
      { timestamps: true }
    );
  
    schema.method("toJSON", function() {
      const { __v, _id, ...object } = this.toObject();
      object.id = _id;
      return object;
    });
  
    const Txs = mongoose.model("tx", schema);
    return Txs;
  };

  
