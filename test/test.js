var CSV2JSON= require("../").CSV2JSON;

var schema= {
    id              : {
        name        : "Id",
        requried    : true,
        validator   : "alphanumeric",
        lowercase   : true,
        unique      : true
    },
    first_name      : {
        name        : "First Name",
        requried    : true
    },
    last_name       : {
        name        : "Last Name",
        requried    : true
    },
    email           : {
        name        : "Email",
        type        : "email",
        requried    : true,
        lowercase   : true
    },
    gender          : {
        name        : "Gender",
        required    : true,
        enum        : ["Male", "Female"]
    }
};

var csv_file= process.argv[2];
var errors= [];

var csv2json= new CSV2JSON(schema, csv_file);
//csv2json.applyValidator(customValidator);
csv2json.on("warning", function(warn){
    console.log(warn);
});
csv2json.on("end", function(data){
    console.log("--");
    if(errors.length >0){
        console.log("Please correct the below errors and try loading csv again");
        console.log(errors);
    }
    else {
        console.log("Successfully loaded "+data.length + " rows from csv");
    }
    console.log("--done--");
});
csv2json.on("error", function(err){
    errors.push(err);
});
csv2json.convert();
