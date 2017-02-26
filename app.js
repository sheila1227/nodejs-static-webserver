var http = require('http');
var url = require('url');
var fs = require('fs');
var path = require('path');
var port = defaultPort = 8081;
var homedir = defaultHomedir = '';
var defaultPage = 'index.html';

var mimeTypes = {
    "css": "text/css",
    "gif": "image/gif",
    "html": "text/html",
    "ico": "image/x-icon",
    "jpeg": "image/jpeg",
    "jpg": "image/jpeg",
    "js": "text/javascript",
    "json": "application/json",
    "pdf": "application/pdf",
    "png": "image/png",
    "svg": "image/svg+xml",
    "swf": "application/x-shockwave-flash",
    "tiff": "image/tiff",
    "txt": "text/plain",
    "wav": "audio/x-wav",
    "wma": "audio/x-ms-wma",
    "wmv": "video/x-ms-wmv",
    "xml": "text/xml"
};

var httpServer = {
    init: init
}

function init() {
    processArguments();
    http.createServer(requestHandler)
        .listen(port, function(error) {
            if (error) {
                console.error('Unable to listen on port', port, error);
            } else {
                console.log('Listening on port ' + port);
            }
        });
}

function processArguments() {
    if (process.argv.length > 2) {
        var argvs = process.argv.slice(2);
        argvs.forEach(function(arg) {
            //get port
            var portMatchResults = arg.match(/^port=(\d+)$/);
            port = (portMatchResults && portMatchResults[1]) ? portMatchResults[1] : defaultPort;
            //get homedir
            var homedirMatchResults = arg.match(/^homedir=(\w+)$/);
            homedir = (homedirMatchResults && homedirMatchResults[1]) ? homedirMatchResults[1] : defaultHomedir;
        });
    }
}

function requestHandler(request, response) {
    var pathName = url.parse(request.url).pathname;
    if(pathName){
    	pathName = pathName.slice(1iz); //remove '/'
    }
    routeHandler(pathName, request, response);
}

function routeHandler(pathName, request, response) {
    var fs = require('fs');

    fs.stat(pathName, function(err, stat) {
        if (err == null) {
            if (stat.isDirectory()) {
                routeHandler(pathname + '/' + defaultPage, request, response);
            } else if (stat.isFile()) {
                responseFile(pathname, request, response);
            } else {
                response.writeHead(404, { 'Content-Type': 'text/plain' });
                response.write('URL NOT FOUND: ' + pathName);
                response.end();
            }
        } else {
            response.writeHead(404, { 'Content-Type': 'text/plain' });
            response.write('URL NOT FOUND: ' + pathName);
            response.end();
        }
    });
}

function responseFile(filePath, request, response) {
    var content = fs.statSync(filePath);
    response.writeHead(200, {
        'Content-Type': getContentType(filePath),
        'Content-Length': content.size
    });

    var readStream = fs.createReadStream(filePath);
    readStream.pipe(response);
}

function getContentType(filePath){
	var fileExtension = path.extname(filePath).split('.').pop();
	return mimeTypes[fileExtension];
}

httpServer.init();
