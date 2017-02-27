var http = require('http');
var url = require('url');
var fs = require('fs');
var path = require('path');
var argv = require('yargs').alias('p', 'port').alias('h', 'homedir').argv;
var config;
var defaultConfig = {
	port: 8081,
	homedir: path.resolve('.'),
	homePage: 'index.html'
};
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
        .listen(config.port, function(error) {
            if (error) {
                console.error('Unable to listen on port', config.port, error);
            } else {
                console.log('Listening on port ' + config.port);
            }
        });
}

function processArguments() {
	config = {
		port: argv.port || defaultConfig.port,
		homedir: argv.homedir || defaultConfig.homedir
	}
}

function requestHandler(request, response) {
    var pathName = url.parse(request.url).pathname;
    pathName = path.join(config.homedir, pathName);
    routeHandler(pathName, request, response);
}

function routeHandler(pathName, request, response) {
    fs.stat(pathName, function(err, stat) {
        if (err == null) {
            if (stat.isDirectory()) {
                routeHandler(path.join(pathName,defaultConfig.homePage), request, response);
            } else if (stat.isFile()) {
                responseFile(pathName, request, response);
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
