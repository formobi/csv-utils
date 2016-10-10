
# node based csv validator and parser 

## Features

1. Parses csv files and returns json object based on mongoose schema like configuration.
1. Validation failure error reporting by row and column numbers to easily identify error location and correct it.
1. Skip/include even/odd rows.
1. Skips empty rows.
1. Provision for custom validation hooks at field level and row level.
1. Unique value validation for columns.
1. Provision for comments in header( text in `(` `)` is ignored)

## Getting started
1. Please check `test/test.js` file for example usage.


## TODO

1. Extensive type support and implicit validators.                                                                                                                                                                                                                                                                                                                                                                    b v bgds????????????????????????????????KJ:isAlphanumeric
1. Usage documentation.
1. Integrate `validator`.
1. Guess header row.
1. Date format support
1. min,max support for number type
1. Add full test suite.
1. Make provision for using this in browser as well.