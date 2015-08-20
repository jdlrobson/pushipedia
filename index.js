var express = require('express');
var app = express();
var fetch = require('node-fetch');
var bodyParser = require('body-parser');
var level = require('level')
var db = level('./mydb')

app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

app.set('port', (process.env.PORT || 5000));

app.use(express.static(__dirname + '/public'));

// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

app.get('/', function ( req, resp ) {
  resp.render( 'pages/index' );
});

app.get('/manifest.json', function ( req, resp ) {
	resp.setHeader('Content-Type', 'application/json');
	resp.send( {
		"gcm_sender_id": process.env.GCM_SENDER_ID
	} );
});

app.post( '/api/broadcast', function ( req, resp ) {
	console.log( 'broadcasting...' );
	var ids = [];
	db.createReadStream( {
			// TODO: Support more than 100 ids.
			limit: 100
		} ).on( 'data', function ( data ) {
			ids.push( data.key );
		} ).on( 'end', function () {
			fetch( 'https://android.googleapis.com/gcm/send', {
				method: 'post',
				headers: {
					'Authorization': "key=" + process.env.GCM_API_KEY,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify( {
					"registration_ids": ids
				} )
			} ).then( function ( r ) {
				console.log( r.status, r.json() );
			} );
		} );
} );

app.post('/api/unsubscribe', function( req, resp ) {
	resp.setHeader('Content-Type', 'text/plain' );
	db.del( req.body.id, function ( err ) {
		if ( err ) {
			resp.send( 'FAIL' );
			response.status( 503 );
		} else {
			resp.send( 'OK' );
		}
	} );
} );

app.post('/api/subscribe', function( req, resp ) {
	resp.setHeader('Content-Type', 'text/plain' );
	db.put( req.body.id, Date.now(), function ( err ) {
		if ( err ) {
			resp.send( 'FAIL' );
			response.status( 503 );
		} else {
			resp.send( 'OK' );
		}
	} );
});

app.get('/api/articles/tfa', function ( req, resp ) {
	console.log( 'get tfa' );
	var d = new Date();
	var month = [ 'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'October', 'November', 'December' ][ d.getMonth() ];
	var pageTitle = 'Wikipedia:Today%27s_featured_article/' + month + '_' + d.getDate() + ',_' + d.getFullYear();
	var qs = 'action=query&prop=extracts&format=json&formatversion=2&explaintext=&titles=' + pageTitle;

	fetch( 'https://en.wikipedia.org/w/api.php?' + qs ).then( function ( wikiResp ) {
		if (wikiResp.status !== 200) {
			response.status( 503 );
		}
		wikiResp.json().then( function ( data ) {
			var page,
				pages = data.query.pages;
			if ( pages.length ) {
				page = pages[0];
				resp.setHeader('Content-Type', 'application/json');
				resp.send( page );
			} else {
				resp.status( 500 );
			}
		} );
	} );
});

app.listen( app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
} );


