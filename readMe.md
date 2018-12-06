# bulkUpload plugin for Snaphy


###Plugin to upload bulk data and attach it to respective model.

###This plugin is exposed on  `/bulkUpload` route

###Please copy the` bulkUpload` folder to `common/settings/` after plugin installed.

### TO Install a npm module use `npm install moduleName --prefix ../../../ --save` and then save the module in package.json of plugin file.

# Steps to clone
1. Clone the submodule from github  
2. create model `BulkModel` from database-format/  
3. Add Settings in datasource
    ```
    {
       ... 
       "BulkUpload": {
            "name": "BulkUpload",
            "provider": "filesystem",
            "root": "/tmp",
            "connector": "loopback-component-storage",
            "maxFileSize": "35485760"
        },
        ...
    }
    ```  
4. Update setting/BulkUpload/conf.json
   ```
    "upload": {
        "containerModel": "BulkUpload",
        "fileDataSource": "BulkUpload"
    },
    "folders":{
        "Product":{
        "model": "Product",
        "identifier": "identifier",
        "properties":{
            "coverImage": "coverImage",
            "other": "otherImages"
        }
        }
    },
    "config": {
        "fileModel": "AmazonImage",
        "containerModel": "container",
        "fileDataSource": "Image",
        "defaultContainer": "draphant",
        "createInitContainer": [
        "draphant"
        ],
        "fileProp": [
        {
            "type": "image",
            "size": 102400,
            "bind": true,
            "thumbPrefix": {
            "thumb": {
                "height": "122px",
                "width": "200px"
            }
            }
        }
        ]
    }
    ```
5. Done!!


## NOTE: This plugin is dependent on `fileUpload` Plugin

####Written by Robins

