/**
 * Created by robins on 2/12/15.
 */
'use strict';
/*jslint browser: true*/
/*$snaphy*/
//This is the setting file of the plugin..TO be configured according to the user needs..
var settings = {
  "defaultTemplate": true,
  "state": "bulkUpload"
};


//Now adding settings to the main index file..
$snaphy.addSettings('bulkUpload', settings);
