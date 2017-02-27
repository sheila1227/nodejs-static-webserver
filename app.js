const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const conf = require('./config/default');
const mime = require('./config/mime');

class Server {
    constructor() {
        this.port = conf.port;
        this.root = conf.root;
    }

    routeHandler(pathName, request, response) {
        fs.stat(pathName, (err, stat) => {
            if (err == null) {
                if (stat.isDirectory()) {
                    routeHandler(pathName + '/' + defaultPage, request, response);
                } else if (stat.isFile()) {
                    this.responseFile(pathName, request, response);
                } else {
                    response.writeHead(404, {
                        'Content-Type': 'text/plain'
                    });
                    response.write('URL NOT FOUND: ' + pathName);
                    response.end();
                }
            } else {
                response.writeHead(404, {
                    'Content-Type': 'text/plain'
                });
                response.write('URL NOT FOUND: ' + pathName);
                response.end();
            }
        });
    }

    responseFile(filePath, request, response) {
        var content = fs.statSync(filePath);
        response.writeHead(200, {
            'Content-Type': this.getContentType(filePath),
            'Content-Length': content.size
        });

        var readStream = fs.createReadStream(filePath);
        readStream.pipe(response);
    }

    getContentType(filePath) {
        var fileExtension = path.extname(filePath).split('.').pop();
        return mime[fileExtension];
    }

    start() {
        http.createServer((req, res) => {
            var pathName = url.parse(req.url).pathname;
            if (pathName) {
                pathName = pathName.slice(1); //remove '/'
            }
            this.routeHandler(pathName, req, res);
        }).listen(this.port, err => {
            if (err) {
                console.log(err);
            } else {
                console.log(`Server start on port ${this.port}`);
            }
        });
    }
}

(new Server).start();
