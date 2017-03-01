const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const conf = require('./config/default');
const mime = require('./config/mime');
const argv = require('yargs').alias('p', 'port').alias('r', 'root').argv;

class Server {
    constructor() {
        this.port = argv.port || conf.port;
        this.root = argv.root || conf.root;
    }

    routeHandler(pathName, req, res) {
        fs.stat(pathName, (err, stat) => {
            if (err == null) {
                if (stat.isDirectory()) {
                    this.routeHandler(path.join(pathName, conf.indexPage), req, res);
                } else if (stat.isFile()) {
                    this.responseFile(pathName, req, res);
                } else {
                    this.responseNotFound(req, res);
                }
            } else {
                this.responseNotFound(req, res);

            }
        });
    }

    responseFile(filePath, req, res) {
        fs.stat(filePath, (err, stats) => {
            if (!err) {
                if (path.extname(filePath).slice(1).match(conf.fileMatch)) {
                    let expires = new Date(Date.now() + conf.maxAge * 1000);
                    res.setHeader('Expires', expires.toUTCString());
                    res.setHeader('Cache-Control', `max-age=${conf.maxAge}`)
                }

                let lastModifiedTime = stats.mtime.toUTCString();
                res.setHeader('Last-Modified', lastModifiedTime);
                if (req.headers['if-modified-since'] && req.headers['if-modified-since'] === lastModifiedTime) {
                    res.writeHead(304, 'Not Modified');
                    res.end();
                } else {
                    res.writeHead(200, {
                        'Content-Type': this.getContentType(filePath),
                        'Content-Length': stats.size
                    });

                    let readStream = fs.createReadStream(filePath);
                    readStream.pipe(res);
                }
            } else {
                res.writeHead(500, {
                    'Content-Type': 'text/plain'
                })
                res.end(err);
            }
        });
    }

    responseNotFound(req, res) {
        res.writeHead(404, {
            'Content-Type': 'text/html'
        });
        res.write(`<h1>Not Found</h1><p>The requested URL ${url.parse(req.url).pathname} was not found on this server.</p>`);
        res.end();
    }

    getContentType(filePath) {
        let fileExtension = path.extname(filePath).split('.').pop();
        return mime[fileExtension] || 'text/plain';
    }

    start() {
        http.createServer((req, res) => {
            let pathName = url.parse(req.url).pathname;
            pathName = path.join(conf.root, pathName);
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
