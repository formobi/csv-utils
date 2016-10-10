
var events  = require("events"),
    util    = require("util");

var csv     = require("csv"),
    fs      = require("fs.extra"),
    Clone   = require("clone"),
    async   = require("async"),
    validator= require("validator");

var VALIDATORS= {
    alphanumeric: function(val){
        return validator.isAlphanumeric(val);
    },
    invalidValidator: function(val){
        return false;
    }
};

var FORMATTERS= {
    lowercase: function(val){
        return val.toLowerCase();
    }
};

var normalizeString= function(str){
    return str.toLowerCase().replace(/[^a-zA-Z0-9]/g, "");
};

var CSV2JSON= function(def, file_path, options){
    this._def= Clone(def);
    this._file_path= file_path;
    this._cols= {};
    this._validators= [];
    this._unique_fields= [];
    this._row_filter= options && options.row_filter? options.row_filter: "";
    events.EventEmitter.call(this);
    for (var field_name in def) {
        var col_name= normalizeString(def[field_name].name);
        this._cols[col_name]= field_name;
        this._def[field_name].col_index= -1;
        if (this._def[field_name].enum) {
            this._def[field_name].pvalues= [];
            for(var i=0; i < this._def[field_name].enum.length; i++){
                this._def[field_name].pvalues.push(normalizeString(this._def[field_name].enum[i]));
            }
        }
        if (this._def[field_name].unique) {
            this._unique_fields.push(field_name);
        }
        if (this._def[field_name].validator) {
            this._def[field_name].validate= VALIDATORS[this._def[field_name].validator] ||
                                                    VALIDATORS["invalidValidator"];
        }
        if (this._def[field_name].lowercase) {
            this._def[field_name].formatter= "lowercase";
            this._def[field_name].format= FORMATTERS["lowercase"];
        }
    }
    this._validators.push(this.uniqueValidator.bind(this));
};

util.inherits(CSV2JSON, events.EventEmitter);

CSV2JSON.prototype._doConvert= function(){
    var def     = this._def,
        cols    = this._cols,
        rows    = [];
    var self= this;
    if(this._file_path.search(/\.csv$/i) === -1){
        self.emit("error", "Invalid File Type: Only CSV file type supported");
        return 0;
    };
    
    csv()
    .from.stream(fs.createReadStream(this._file_path))
    .on('record', function(row,index){
        row._idx= index;
        rows.push(row);
    })
    .on('end', function(count){
        var cols_required_not_found= [],
            cols_optional_not_found= [],
            cols_to_ignore= [],
            col_indices_tobetaken= [],
            col_indices= {};
        var header= rows.shift();
        
        var isEmptyRow= function(row){
            var is_empty= true;
            for (var i=0, n=row.length; i<n; i++) {
                if (row[i]) {
                    is_empty= false;
                }
            }
            return is_empty;
        };
        
        for (var i=0; i< header.length; i++) {
            //ignore any text inside ()/[], which is considered to be explanation of the column
            var col_name= header[i].replace(/(?:\r\n|\r|\n)/g,'')
                                    .replace(/\(.*\)/g, '')
                                    .replace(/\[.*\]/g, '');
            col_name=normalizeString(col_name);
            var field_name= cols[col_name];
            if (!field_name) {
                cols_to_ignore.push(header[i]);
            }
            else {
                def[field_name].col_index= i;
            }
        }
        for (var field_name in def) {
            var field_def= def[field_name];
            if (field_def.col_index === -1) {
                if (field_def.required) {
                    cols_required_not_found.push(field_def.name);
                }
                else {
                    cols_optional_not_found.push(field_def.name);
                }
            }
        }
        if (cols_required_not_found.length >0) {
            self.emit("error", "Required Columns Not Found:("+cols_required_not_found.length+")- "
                       +cols_required_not_found.join(", "));
            return self.emit("end");
        }
        if (cols_to_ignore.length !== 0){
            self.emit("warninig", "Ignoring Extra columns("+cols_to_ignore.length+"): "
                        +cols_to_ignore.join(", "));
        }
        
        if (cols_optional_not_found.length !== 0) {
            self.emit("warninig", "Missing Optional Columns("+cols_optional_not_found.length+"): "
                            +cols_optional_not_found.join(", "));
        }
        var data= [], errcount= 0, prev_values= {}, ridx=0;
        
        var processRow= function(r, next){
            var obj= {}, skip_row= false;
            if (isEmptyRow(rows[ridx])) {
                skip_row= true;
            }
            if (self._row_filter === "even") {
                skip_row= (ridx%2 === 1)? false: true;
            }
            else if (self._row_filter === "odd") {
                skip_row= (ridx%2 === 0)? false: true;
            }
            for (var field_name in def){
                if (skip_row){
                    continue;
                }
                var field_def= def[field_name], val= "";
                if (field_def.col_index !== -1) {
                    val= (rows[ridx][field_def.col_index]||"").trim();
                }
                if (field_def.formatter) {
                    val= field_def.format(val);
                }
                if ((field_def.type === Boolean) || (field_def.type === "boolean")) {
                    if (val.toLowerCase() === "true" || val.toLowerCase()  === "yes") {
                        val= true;
                    }
                    else {
                        val= false;
                    }
                }
                if (!val&&field_def.load_prev_val_if_empty) {
                    val= prev_values[field_name];
                }
                if (field_def.required) {
                    if (!val) {
                        errcount++;
                        self.emit("error", "Cell Value Empty for '"+field_def.name+"' at "
                                  +(ridx+2)+(String.fromCharCode(65+field_def.col_index)));
                    }
                    else if (field_def.pvalues && field_def.pvalues.length>0
                             && field_def.pvalues.indexOf(normalizeString(val))=== -1) {
                        errcount++;
                        var msg= field_def.enum.length ==1 ? "Can only be ": "Must be one of ";
                        self.emit("error", "Cell value Invalid for '"+field_def.name+"'("+val+") at "
                                  +(ridx+2)+(String.fromCharCode(65+field_def.col_index))
                                  + " "+msg+" '"+field_def.enum.join(", ")+"'");
                    }
                }
                if (field_def.validator && !field_def.validate(val)) {
                    errcount++;
                    self.emit("error", "Cell validation '"+field_def.validator+"' failed for '"+field_def.name+"'("+val+") at "
                              +(ridx+2)+(String.fromCharCode(65+field_def.col_index)))
                        
                }
                prev_values[field_name]= val;
                obj[field_name]= val;
            }
            if (!skip_row) {
                obj._idx= rows[ridx]._idx;
                data.push(obj);
            }
            ridx++;
            setTimeout(function(){
                return next();
            });
            return 0;
        };
        
        async.eachSeries(rows, processRow, function(){
            if (errcount >0) {
                return self.emit("end");
            }
            var fns= [];
            for (var i=0; i< self._validators.length; i++) {
                fns.push(self._validators[i].bind(self, data));
            }
            //Apply validators
            async.series(fns, function(err, results){
                for (var i=0; i < results.length; i++) {
                    var messages= results[i] || [];
                    for(var j=0; j< messages.length; j++){
                        self.emit(messages[j].type || "error", messages[j].msg + " at "+(messages[j].ridx+2)
                                  +(String.fromCharCode(65+self._def[messages[j].field].col_index)));
                    }
                }
                return self.emit("end",data, rows);
            });
            return 0;
        })
        return 0;
    })
    .on('error', function(err){
        self.emit("error", err);
        self.emit("end");
    });
    return 0;
};

CSV2JSON.prototype.uniqueValidator= function(rows, next){
    var errors= [];
    var unique_fields= this._unique_fields;
    var maps= {};
    for (var i=0; i < unique_fields.length; i++) {
        maps[unique_fields[i]]= {};
    }
    var i=0;
    var doValidate= function(){
        for (var j=0; j< unique_fields.length; j++){
            var field_name= unique_fields[j],
                field_value= rows[i][field_name];
            if (maps[field_name][field_value]) {
                errors.push({
                    field: field_name,
                    ridx: i,
                    msg: "Duplicate entry for "+this._def[field_name].name + "("+ field_value+")"
                });
            }
            else {
                maps[field_name][field_value]= 1;
            }
        }
        i++;
        setTimeout(next, 0);
    };
    async.eachSeries(rows, doValidate, function(){
        return next(null, errors.length>0 ? errors : null);
    });
};

//These validators invoked at the end -- for now unique validator is invoked using this.
CSV2JSON.prototype.applyValidator= function(fn){
    this._validators.push(fn);
};

CSV2JSON.prototype.convert= function(){
    setTimeout(this._doConvert.bind(this), 1);    //context switch
};

module.exports= CSV2JSON;
