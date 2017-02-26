var http = require('http');

http.createServer(function(request, response){
	response.end('hello world');
}).listen(8081);