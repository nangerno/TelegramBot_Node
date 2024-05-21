module.exports = mongoose => {
    var schema = mongoose.Schema(
      {
        id: String,
        displayName: String,
        userName: String,
        elaAmount: Number,
        goldAmount: Number,
        uniqueCode: String
      },
      { timestamps: true }
    );
  
    schema.method("toJSON", function() {
      const { __v, _id, ...object } = this.toObject();
      object.id = _id;
      return object;
    });
  
    const TelUsers = mongoose.model("teluser", schema);
    return TelUsers;
  };

  
