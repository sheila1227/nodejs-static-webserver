const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const conf = require('./config/default');
const mime = require('./config/mime');
const zlib = require('zlib');
const opn = require('opn');
const os = require('os');
const ifaces = os.networkInterfaces();
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
                    if (fs.existsSync(path.join(pathName, conf.indexPage))) {
                        this.responseFile(path.join(pathName, conf.indexPage), req, res);
                    } else {
                        this.responseContentList(pathName, req, res);
                    }
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

    responseContentList(pathName, req, res) {
        fs.readdir(pathName, (err, files) => {
            if (err) {
                res.writeHead(500, {
                    'Content-Type': 'text/plain'
                });
                res.end(err);
            } else {
                const requestPath = url.parse(req.url).pathname;
                let content = `<h1>Index of ${requestPath}</h1>`;
                files.forEach(file => {
                    content += `<p><a href='${path.join(requestPath,file)}'>${file}</a></p>`;
                });
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(content);
            }
        });
    }

    responseFile(filePath, req, res) {
        fs.stat(filePath, (err, stats) => {
            if (!err) {
                res.setHeader('Accept-Ranges', 'bytes');
                if (path.extname(filePath).match(conf.fileMatch)) {
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
                    res.setHeader('Content-Type', this.getContentType(filePath));

                    let range = this.getRange(req.headers['range'], stats.size);
                    let readStream;
                    if (range && range.isValid) {
                        res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/stats.size`);
                        res.setHeader('Content-Length', range.end - range.start + 1);
                        readStream = fs.createReadStream(filePath, { start: range.start, end: range.end });
                        this.compressHandler(filePath, readStream, 206, 'Partial Content', req, res);
                    } else if (range && !range.isValid) {
                        res.writeHead(416, 'Request Range Not Satisfiable');
                        res.end();
                    } else {
                        readStream = fs.createReadStream(filePath);
                        res.setHeader('Content-Length', stats.size);
                        this.compressHandler(filePath, readStream, 200, 'OK', req, res);
                    }
                }
            } else {
                res.writeHead(500, {
                    'Content-Type': 'text/plain'
                });
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

    compressHandler(filePath, readStream, statusCode, message, req, res) {
        if (path.extname(filePath).match(conf.zipMatch)) {
            let acceptEncoding = req.headers['accept-encoding'] || '';
            if (acceptEncoding.match(/\bgzip\b/)) {
                res.setHeader('Content-Encoding', 'gzip');
                res.writeHead(statusCode, message);
                readStream.pipe(zlib.createGzip()).pipe(res);
            } else if (acceptEncoding.match(/\bdeflate\b/)) {
                res.setHeader('Content-Encoding', 'deflate');
                res.writeHead(statusCode, message);
                readStream.pipe(zlib.createDeflate()).pipe(res);
            } else {
                res.writeHead(statusCode, message);
                readStream.pipe(res);
            }
        } else {
            res.writeHead(statusCode, message);
            readStream.pipe(res);
        }
    }

    getContentType(filePath) {
        let fileExtension = path.extname(filePath).split('.').pop();
        return mime[fileExtension] || 'text/plain';
    }

    getRange(rangeInHeaders, fullSize) {
        if (!rangeInHeaders) {
            return null;
        }
        if (rangeInHeaders.indexOf(',') !== -1) {
            return { isValid: false };
        }
        let range = rangeInHeaders.split('-'),
            start = parseInt(range[0], 10),
            end = parseInt(range[1], 10);
        if (isNaN(start)) {
            start = fullSize - end;
            end = fullSize - 1;
        } else if (isNaN(end)) {
            end = fullSize - 1;
        }
        if (isNaN(start) || isNaN(end) || start > end || end > fullSize) {
            return { isValid: false };
        }
        return {
            start: start,
            end: end,
            isValid: true
        }

    }

    openInDefaultBrowser() {
        let ipAddress;
        Object.keys(ifaces).forEach(function(ifname) {
            ifaces[ifname].forEach(function(iface) {
                if ('IPv4' === iface.family || iface.internal == true) {
                    // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
                    ipAddress = iface.address;
                    return;
                }
            });
        });
        ipAddress = ipAddress || '127.0.0.1';
        opn(`http://${ipAddress}:${this.port}`);
    }

    start() {
        http.createServer((req, res) => {
            let pathName = decodeURI(url.parse(req.url).pathname);
            pathName = path.join(this.root, pathName);
            this.routeHandler(pathName, req, res);
        }).listen(this.port, err => {
            if (err) {
                console.log(err);
            } else {
                console.log(`Server start on port ${this.port}`);
                this.openInDefaultBrowser();
            }
        });
    }
}

(new Server).start();
