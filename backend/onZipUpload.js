'use strict';
var IncomingForm = require('formidable');
const Promise = require("bluebird");
var fs = require("fs");
const AdmZip = require('adm-zip');
const async = require("async");



module.exports = function (server, databaseObj, helper, packageObj) {

    const AmazonImage = helper.loadPlugin("fileUpload");

    const init = function (importDataFunc) {
        const Container = server.models[packageObj.upload.containerModel];
        modifyContainerUpload(server, Container, packageObj.upload, packageObj);
    };

    const modifyContainerUpload = function (app, Container, config, packageObj) {
        //Get the dataSource object..
        //const FileDataSource = config.fileDataSource;
        Container.beforeRemote('upload', function (ctx, res, next) {
            //Start the file uploading process..
            uploadFile(app, ctx.req, ctx.res, config, packageObj, {}, function (err, filePath) {
                if (err) {
                    console.log(err);
                    ctx.res.status(500).send(err);
                } else {
                    console.log("DATA UPLOADED");
                    return ctx.res.send({});
                    //next();
                }
            });

        });
    }; //modifyContainerUpload files..



    const uploadFile = function (app, req, res, config, packageObj, options, cb) {
        //console.log("Now uploading files to S3");
        const storageService = app.dataSources[config.fileDataSource].connector;
        if (!cb && 'function' === typeof options) {
            cb = options;
            options = {};
        }
        if (storageService.getFilename && !options.getFilename) {
            options.getFilename = storageService.getFilename;
        }
        if (storageService.acl && !options.acl) {
            options.acl = storageService.acl;
        }
        if (storageService.allowedContentTypes && !options.allowedContentTypes) {
            options.allowedContentTypes = storageService.allowedContentTypes;
        }
        if (storageService.maxFileSize && !options.maxFileSize) {
            options.maxFileSize = storageService.maxFileSize;
        }
        return handler(app, storageService.client, req, res, config, packageObj, options, cb);
    };



	/**
	 * Custom handler for handling the amazon upload type
	 * @param  {Object}   app             loopback app type object
	 * @param  {Object}   provider        Providserieser type either filesystem | Amazon S3 etc
	 * @param  {Object}   req             Request object
	 * @param  {Object}   res             Response Object
	 * @param  {Object}   config          Plugin Config of PackageObj of snaphy
	 * @param  {Object}   packageObj      Settings of PackageObj
	 * @param  {Object}   options         Extra options for storing file description or details.
	 * @param  {Function} cb              Callback function. arguments (err, file)
	 */
    var handler = function (app, provider, req, res, config, packageObj, options, cb) {
        let form = new IncomingForm(options);
        let fields = {};
        let files = [];

        form
            .on('field', function (field, value) {
                fields[field] = value;
            })
            .on('file', function (field, file) {
                //Parse zip file..
                //Run a loop on each file ..
                parseZipFile(app, file, req)
                    .then(files => {
                        cb();
                        setImmediate(() => {
                            deleteLocalFile(files.zip);
                            deleteLocalFile(files.folder, true);
                        });
                    })
                    .catch(error => {
                        console.error("Error occured while bulk uploading");
                        cb(error);
                    })

                // const fileName = renameFile(file, req);
                // uploadImageToCloud(app, file, fileName, importDataFunc, cb);
            })
            .on('end', function (name, file) {
                //console.log("END-> File fetched\n");
            });
        form.parse(req);
    };


    /**
     * Will start parsing zip and upload image to cloud in batch of 10 or some number
     * @param {*} app 
     * @param {*} file 
     * @param {*} fileName 
     */
    const parseZipFile = (app, file, req) => {
        return new Promise((resolve, reject) => {
            console.log("File uploaded successfully..");
            const zipPath = file.path;
            // reading archives
            var zip = new AdmZip(zipPath);
            const folderName = file.name.replace(".zip", "");
            const folderPath = `/tmp/${folderName}`;
            zip.extractAllTo(folderPath, /*overwrite*/true);

            findFoldersAndUploadRecursively(app, packageObj, folderPath, req)
                .then(done => {
                    const files = { zip: zipPath, folder: folderPath };
                    resolve(files);
                })
                .catch(error => {
                    reject(error)
                });
        });
    }


    /**
     * Will find the zip extracted inside folder recursively...
     * @param {*} app 
     * @param {*} packageObj 
     * @param {*} folderPath  Extracted zip folder path
     */
    const findFoldersAndUploadRecursively = (app, packageObj, folderPath, req) => {
        return new Promise((resolve, reject) => {
            if (fs.existsSync(folderPath)) {
                const seriesList = [];
                fs.readdirSync(folderPath).forEach(function (file, index) {
                    seriesList.push((callback) => {
                        var curPath = folderPath + "/" + file;
                        if (fs.lstatSync(curPath).isDirectory()) {
                            findModelInstancesRecursively(app, packageObj, file, curPath, req)
                                .then(done => {
                                    callback();
                                })
                                .catch(error => {
                                    callback(error);
                                });
                        } else {
                            //Do nothing here..
                            callback();
                        }
                    });

                });
                async.series(seriesList, (err, done) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            } else {
                console.log("Bad file format. Not supported");
                resolve();
            }
        });
    };


    /**
     * Will upload all files recursive..
     */
    const findModelInstancesRecursively = (app, packageObj, folderName, folderPath, req) => {
        return new Promise((resolve, reject) => {
            if (packageObj.folders[folderName]) {
                const { model, identifier, properties } = packageObj.folders[folderName];
                if (fs.existsSync(folderPath)) {
                    const seriesList = [];
                    fs.readdirSync(folderPath).forEach(function (file, index) {
                        seriesList.push((callback) => {
                            var instancePath = folderPath + "/" + file;
                            if (fs.lstatSync(instancePath).isDirectory()) {
                                findFilesAndUploadRecursively(app, model, identifier, properties, file, instancePath, req)
                                    .then(done => {
                                        callback();
                                    })
                                    .catch(error => {
                                        callback(error);
                                    });
                            } else {
                                //Do nothing here..
                                callback();
                            }
                        });

                    });
                    async.series(seriesList, (err, done) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                } else {
                    console.log("Bad file format. Not supported");
                    resolve();
                }
            } else {
                reject(new Error("Unsupported folder name format. Not found in config entry"));
            }
        });
    };



    /**
     * Will find all the files and upload....
     * @param {*} app 
     * @param {*} model 
     * @param {*} identifier 
     * @param {*} properties 
     * @param {*} identifierValue 
     * @param {*} instancePath 
     */
    const findFilesAndUploadRecursively = (app, model, identifier, properties, identifierValue, instancePath, req) => {
        return new Promise((resolve, reject) => {
            console.log(model, identifier, identifierValue, instancePath);
            const modelClass = app.models[model]
            const where = {};
            where[identifier] = identifierValue
            modelClass.findOne({
                where: where,
            })
                .then(modelInstance => {
                    if (!modelInstance) {
                        throw new Error("Wrong Identifier:" + identifier + ", Not found in database");
                    }
                    return modelInstance;
                })
                .then(modelInstance => {
                    return findFilesAndUploadRecursivelyFinally(app, modelInstance, model, identifier, properties, identifierValue, instancePath, req);
                })
                .then(done => {
                    resolve();
                })
                .catch(error => {
                    reject(error);
                });
        });
    };



    const findFilesAndUploadRecursivelyFinally = (app, modelInstance, model, identifier, properties, identifierValue, instancePath, req) => {
        return new Promise((resolve, reject) => {
            if (fs.existsSync(instancePath)) {
                const seriesList = [];
                const promiseList = [];
                fs.readdirSync(instancePath).forEach(function (file, index) {
                    seriesList.push((callback) => {
                        var fileOrFolderPath = instancePath + "/" + file;
                        if (fs.lstatSync(fileOrFolderPath).isDirectory()) {
                            //TODO: Manage folder upload later..
                            fs.readdirSync(fileOrFolderPath).forEach(function (file, index) {
                                const filePath = `${fileOrFolderPath}/${file}`;
                                promiseList.push(uploadFileToAws(app, file, filePath, properties, modelInstance, req));
                            });

                            Promise.all(promiseList)
                                .then(fileObjArr => {
                                    const modelPropertyName = properties[file];
                                    if(modelPropertyName){
                                        modelInstance[modelPropertyName] = fileObjArr;
                                        callback()
                                    }else {
                                        const err = "BulkUpload: Wrong properties name, " + file + " not found"
                                        console.error(err);
                                        throw new Error(err);
                                    }
                                    
                                })
                                .catch(callback);
                        } else {
                            uploadFileToAws(app, file, fileOrFolderPath, properties, modelInstance, req)
                                .then(fileObj => {
                                    const fileWithoutExt = file.replace(/\..+$/, "");
                                    if (properties[fileWithoutExt]) {
                                        const modelPropertyName = properties[fileWithoutExt];
                                        console.log("File saved");
                                        modelInstance[modelPropertyName] = fileObj;
                                        callback();
                                    } else {
                                        const err = "BulkUpload: Wrong properties name, " + fileWithoutExt + " not found"
                                        console.error(err);
                                        throw new Error(err);
                                    }
                                    
                                })
                                .catch(callback);
                        }
                    });
                });



                async.series(seriesList, (err, done) => {
                    if (err) {
                        reject(err);
                    } else {
                        //All done now save the data..
                        modelInstance.save()
                            .then(resolve)
                            .catch(reject)
                    }
                });
            } else {
                console.log("Bad file format. Not supported");
                resolve();
            }
        });
    };



    const uploadFileToAws = (app, file, fileOrFolderPath, properties, modelInstance, req) => {
        return new Promise((resolve, reject) => {
            //Upload file to server...
           
         
                //Now upload image to cloud..
                AmazonImage.uploadImageLocally(app, fileOrFolderPath, file, packageObj.config, packageObj.config.defaultContainer, req)
                    .then(fileObj => {
                        resolve(fileObj);
                    })
                    .catch(error => {
                        reject(error);
                    })
            
        });
    };




    var deleteFolderRecursive = function (path) {
        if (fs.existsSync(path)) {
            fs.readdirSync(path).forEach(function (file, index) {
                var curPath = path + "/" + file;
                if (fs.lstatSync(curPath).isDirectory()) { // recurse
                    deleteFolderRecursive(curPath);
                } else { // delete file
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(path);
        }
    };


    var deleteLocalFile = function (path, isFolder = false) {
        if (isFolder) {
            deleteFolderRecursive(path);
        } else {
            fs.unlink(path, function (err) {
                if (err) {
                    console.error("Error deleting image from the path.");
                } else {
                    console.log('successfully deleted ' + path);
                }

            });
        }
    };



    var renameFile = function (file, req) {
        //var fileExtension = file.name.split(/\.$/).pop();
        var fileExtension;
        //var container = file.container;
        var time = new Date().getTime();
        var userId = getUserId(req);

        var UUID = guid();
        //Now preparing the file name..
        //customerId_time_orderId.extension
        //Pattern for detecting the file extension
        var pattern = /^.+\/(.+)$/;
        if (!fileExtension) {
            var extension = pattern.exec(file.type);
            try {
                if (extension.length) {
                    var DOCXTypePatt = /^application\/vnd\.(.+)$/; //http://stackoverflow.com/questions/4212861/what-is-a-correct-mime-type-for-docx-pptx-etc
                    var MSWord = /^application\/msword$/;
                    if (DOCXTypePatt.test(file.type)) {
                        //In case of mobile upload..
                        fileExtension = "xlsx";
                    } else if (MSWord.test(file.type)) {
                        //In case of mobile upload..
                        fileExtension = "doc";
                    } else {
                        //In case of mobile upload..
                        let fileName = file.name;
                        if (/^.+\.pdf$/.test(fileName)) {
                            fileExtension = "pdf";
                        } else if (/^.+\.docx$/.test(fileName)) {
                            fileExtension = "docx";
                        } else if (/^.+\.doc$/.test(fileName)) {
                            fileExtension = "doc";
                        } else if (/^.+\.jpg$|^.+\.png$/.test(fileName)) {
                            fileExtension = "image";
                        } else {
                            fileExtension = extension[1];
                        }

                    }

                } else {
                    var err = new Error("Error: File Extension not found");
                    console.error("Error: File Extension not found");
                    return err;
                }
            } catch (err) {
                console.error(err);
                return err;
            }

            if (fileExtension === 'jpeg') {
                fileExtension = "jpg";
            }

        }

		/*if(fileExtension !== "jpg" || fileExtension !== "png" || fileExtension !== "gif"){
		 fileExtension = "jpg";
		 }*/

        var NewFileName = '' + userId + '_' + time + '_' + UUID + '.' + fileExtension;

        //And the file name will be saved as defined..
        return NewFileName;
    }


    function getUserId(req) {
        var userId;
        try {
            //var query = req.query;
            userId = req.accessToken.userId;
        }
        catch (err) {
            //TODO Remove this to support only login user upload..
            userId = guid();
            console.error("Got error accessing user information from accesstoken in helper.js file in fileUpload");
        }

        return userId;
    }


    function guid() {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
            s4() + '-' + s4() + s4() + s4();
    }








    return {
        init: init
    };
};
