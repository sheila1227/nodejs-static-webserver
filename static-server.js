const http = require('http');
const path = require('path');
const fs = require('fs');
const url = require('url');
const zlib = require('zlib');
const mime = require('./mime');
const config = require('./config/default');

var options = require( "yargs" )
    .option( "p", { alias: "port",  describe: "Port number", type: "number" } )
    .option( "r", { alias: "root", describe: "Static resource directory", type: "string" } )
    .option( "i", { alias: "index", describe: "Default page", type: "string" } )
    .option( "c", { alias: "cachecontrol", default: true, describe: "Use Cache-Control", type: "boolean" } )
    .option( "e", { alias: "expires", default: true, describe: "Use Expires", type: "boolean" } )
    .option( "t", { alias: "etag", default: true, describe: "Use ETag", type: "boolean" } )
    .option( "l", { alias: "lastmodified", default: true, describe: "Use Last-Modified", type: "boolean" } )
    .option( "m", { alias: "maxage", describe: "Time a file should be cached for", type: "number" } )
    .help()
    .alias( "?", "help" )
    .argv;

const hasTrailingSlash = url => url[url.length - 1] === '/';

class StaticServer {
    constructor() {
        this.port = options.p || config.port;
        this.root = options.r || config.root;
        this.indexPage = options.i || config.indexPage;
        this.enableCacheControl = options.c;
        this.enableExpires = options.e;
        this.enableETag = options.t;
        this.enableLastModified = options.l;
        this.maxAge = options.m || config.maxAge;
    }

    respondError(err, res) {
        res.writeHead(500);
        return res.end(err);        
    }

    respondNotFound(req, res) {
        res.writeHead(404, {
            'Content-Type': 'text/html'
        });
        res.end(`<h1>Not Found</h1><p>The requested URL ${req.url} was not found on this server.</p>`);
    }

    generateETag(stat) {
        const mtime = stat.mtime.getTime().toString(16);
        const size = stat.size.toString(16);
        return `W/"${size}-${mtime}"`;
    }

    setFreshHeaders(stat, res) {
        const lastModified = stat.mtime.toUTCString();
        if (this.enableExpires) {
            const expireTime = (new Date(Date.now() + this.maxAge * 1000)).toUTCString();
            res.setHeader('Expires', expireTime);
        }
        if (this.enableCacheControl) {
            res.setHeader('Cache-Control', `public, max-age=${this.maxAge}`);
        }
        if (this.enableLastModified) {
            res.setHeader('Last-Modified', lastModified);
        }
        if (this.enableETag) {
            res.setHeader('ETag', this.generateETag(stat));
        }
    }

    isFresh(reqHeaders, resHeaders) {
        const  noneMatch = reqHeaders['if-none-match'];
        const  lastModified = reqHeaders['if-modified-since'];
        if (!(noneMatch || lastModified)) return false;
        if(noneMatch && (noneMatch !== resHeaders['etag'])) return false;
        if(lastModified && lastModified !== resHeaders['last-modified']) return false;
        return true;
    }

    shouldCompress(pathName) {
        return path.extname(pathName).match(this.zipMatch);
    }

    respond(pathName, req, res) {
        fs.stat(pathName, (err, stat) => {
            if (err) return respondError(err, res);
            this.setFreshHeaders(stat, res);
            if (this.isFresh(req.headers, res._headers)) {
                this.responseNotModified(res);
            } else {
                this.responseFile(stat, pathName, req, res);
            }
        });

    }

    responseNotModified(res) {
        res.statusCode = 304;
        res.end();
    }

    compressHandler(readStream, req, res) {
        const acceptEncoding = req.headers['accept-encoding'];
        if (!acceptEncoding || !acceptEncoding.match(/\b(gzip|deflate)\b/)) {
            return readStream;
        } else if (acceptEncoding.match(/\bgzip\b/)) {
            res.setHeader('Content-Encoding', 'gzip');
            return readStream.pipe(zlib.createGzip());
        } else if (acceptEncoding.match(/\bdeflate\b/)) {
            res.setHeader('Content-Encoding', 'deflate');
            return readStream.pipe(zlib.createDeflate());
        }
    }

    getRange(rangeText, totalSize) {
        const matchResults = rangeText.match(/bytes=([0-9]*)-([0-9]*)/);
        let start = parseInt(matchResults[1]);
        let end = parseInt(matchResults[2]);
        if (isNaN(start) && !isNaN(end)) {
            start = totalSize - end;
            end = totalSize - 1;
        } else if (!isNaN(start) && isNaN(end)) {
            end = totalSize - 1;
        }
        return {
            start,
            end
        }
    }

    rangeHandler(pathName, rangeText, totalSize, res) {
        const range = this.getRange(rangeText, totalSize);
        if (range.start > totalSize || range.end > totalSize || range.start > range.end) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${totalSize}`);
            res.end();
            return null;
        } else {
            res.statusCode = 206;
            res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${totalSize}`);
            return fs.createReadStream(pathName, { start: range.start, end: range.end });
        }
    }

    responseFile(stat, pathName, req, res) {
        let readStream;
        res.setHeader('Content-Type', mime.lookup(pathName));
        res.setHeader('Accept-Ranges', 'bytes');
        if (req.headers['range']) {
            readStream = this.rangeHandler(pathName, req.headers['range'], stat.size, res);
            if (!readStream) return;
        } else {
            readStream = fs.createReadStream(pathName);
        }
        if (this.shouldCompress(pathName)) {
            readStream = this.compressHandler(readStream, req, res);
        }
        readStream.pipe(res);
    }

    respondRedirect(req, res) {
        const location = req.url + '/';
        res.writeHead(301, {
            'Location': location,
            'Content-Type': 'text/html'
        });
        res.end(`Redirecting to <a href='${location}'>${location}</a>`);
    }

    respondDirectory(pathName, req, res) {
        const indexPagePath = path.join(pathName, this.indexPage);
        if (fs.existsSync(indexPagePath)) {
            this.respond(indexPagePath, req, res);
        } else {
            fs.readdir(pathName, (err, files) => {
                if (err) {
                    respondError(err, res);
                }
                const requestPath = url.parse(req.url).pathname;
                let content = `<h1>Index of ${requestPath}</h1>`;
                files.forEach(file => {
                    let itemLink = path.join(requestPath,file);
                    const stat = fs.statSync(path.join(pathName, file));
                    if (stat && stat.isDirectory()) {
                        itemLink = path.join(itemLink, '/');
                    }                 
                    content += `<p><a href='${itemLink}'>${file}</a></p>`;
                });
                res.writeHead(200, {
                    'Content-Type': 'text/html'
                });
                res.end(content);
            });
        }
    }

    routeHandler(pathName, req, res) {
        fs.stat(pathName, (err, stat) => {
            if (!err) {
                const requestedPath = url.parse(req.url).pathname;
                if (hasTrailingSlash(requestedPath) && stat.isDirectory()) {
                    this.respondDirectory(pathName, req, res);
                } else if (stat.isDirectory()) {
                    this.respondRedirect(req, res);
                } else {
                    this.respond(pathName, req, res);
                }
            } else {
                this.respondNotFound(req, res);
            }
        });
    }

    start() {
        http.createServer((req, res) => {
            const pathName = path.join(this.root, path.normalize(req.url));
            this.routeHandler(pathName, req, res);
        }).listen(this.port, err => {
            if (err) {
                console.error(err);
                console.info('Failed to start server');
            } else {
                console.info(`Server started on port ${this.port}`);
            }
        });
    }
}

module.exports = StaticServer;