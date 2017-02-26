var http = require('http');
var port = defaultPort = 8081;



var httpServer = {
	init: init
}

function init(){
	processArguments();
	http.createServer(function(request,response){
		response.end('hello world');
	}).listen(port, function(error){
		if(error){
			console.error('Unable to listen on port',port,error);
		}else{
			console.log('Listening on port '+port);
		}
	});	
}

function processArguments() {
	if(process.argv.length>2){
		var argvs = process.argv.slice(2);
		argvs.forEach(function(arg){
			//get port
			var portMatchResults = arg.match(/^port=(\d+)$/);
			port = (portMatchResults&&portMatchResults[1])?portMatchResults[1]:defaultPort;			
		});
	}	
}

httpServer.init();