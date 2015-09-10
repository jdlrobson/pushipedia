var express = require('express');
var basicAuth = require('basic-auth');
var app = express();
var fetch = require('node-fetch');
var bodyParser = require('body-parser');
var level = require('level')
var db = level('./mydb')

// Auth
var auth = function (req, res, next) {
	var user = basicAuth(req);
	if (!user || !user.name || !user.pass) {
		return res.send(401).end();
	} else {
		if (user.name === 'broadcaster' && user.pass === process.env.BROADCAST_SECRET) {
			return next();
		} else {
			return res.send(401).end();
		};
 }
};

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

function ping( ids ) {
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
}

function broadcast( feature ) {
	var ids = [];
	db.createReadStream( {
			gt: feature + '!',
			 // stop at the last key with the prefix
			lt: feature + '\xFF',
			// TODO: Support more than 100 ids.
			limit: 100
		} ).on( 'data', function ( data ) {
			var id = data.key.split( '!' )[ 1 ];
			if ( !id ) {
				// bad data so cleanup
				db.del( data.key );
			}
			ids.push( id );
		} ).on( 'end', function () {
			ping( ids );
		} );
}

app.post( '/api/broadcast', auth, function ( req, resp ) {
	console.log( 'broadcasting...' );
	broadcast( 'tfa' );
	broadcast( 'potd' );
	resp.setHeader('Content-Type', 'text/plain' );
	resp.status( 200 );
	resp.send( 'OK' );
} );

app.post( '/api/preview', function ( req, resp ) {
	var id = req.body.id;
	if ( !id ) {
		resp.status( 400 );
		resp.send( 'FAIL' );
	} else {
		resp.setHeader('Content-Type', 'text/plain' );
		ping( [ id ] );
		resp.status( 200 );
		resp.send( 'OK' );
	}
} );

app.post('/api/unsubscribe', function( req, resp ) {
	var feature = req.body.feature;
	var id = req.body.id;
	if ( !feature || !id ) {
		resp.status( 400 );
		resp.send( 'FAIL' );
	}
	resp.setHeader('Content-Type', 'text/plain' );
	db.del( feature + '!' + req.body.id, function ( err ) {
		if ( err ) {
			resp.send( 'FAIL' );
			resp.status( 503 );
		} else {
			resp.send( 'OK' );
		}
	} );
} );

app.post('/api/subscribe', function( req, resp ) {
	var feature = req.body.feature;
	var id = req.body.id;
	if ( !feature || !id ) {
		resp.status( 400 );
		resp.send( 'FAIL' );
	}
	resp.setHeader('Content-Type', 'text/plain' );
	db.put( feature + '!' + id, Date.now(), function ( err ) {
		if ( err ) {
			resp.send( 'FAIL' );
			resp.status( 503 );
		} else {
			resp.send( 'OK' );
		}
	} );
});

app.get('/api/articles/potd', function ( req, resp ) {
	var d = new Date();
	var month = d.getMonth() + 1;
	var day = d.getDate();
	day = day < 10 ? '0' + day : day;
	month = month < 10 ? '0' + month : month;
	var date = d.getFullYear() + '-' +  month + '-' + day;
	var qs = 'action=query&prop=images&format=json&formatversion=2&titles=Template%3APotd%2F' + date;
	fetch( 'https://commons.wikimedia.org/w/api.php?' + qs ).then( function ( wikiResp ) {
		if (wikiResp.status !== 200) {
			resp.status( 503 );
		}
		wikiResp.json().then( function ( data ) {
			var page, images,
				pages = data.query.pages;
			if ( pages.length ) {
				images = pages[0].images;
				if ( images.length ) {
					console.log(images[0]);
					console.log('boom');
					respondWithJsonCard( resp, images[0].title );
				} else {
					resp.status( 500 );
				}
			} else {
				resp.status( 500 );
			}
		} );
	} );
} );

app.get('/api/articles/tfa', function ( req, resp ) {
	console.log( 'get tfa' );
	var d = new Date();
	var month = [ 'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December' ][ d.getMonth() ];
	var pageTitle = 'Wikipedia:Today%27s_featured_article/' + month + '_' + d.getDate() + ',_' + d.getFullYear();
	respondWithJsonCard( resp, pageTitle );
} );

function respondWithJsonCard( resp, pageTitle ) {
	var qs = 'action=query&prop=pageimages|extracts&piprop=thumbnail&format=json&formatversion=2&explaintext=&titles=' + encodeURIComponent( pageTitle );
	fetch( 'https://en.wikipedia.org/w/api.php?' + qs ).then( function ( wikiResp ) {
		if (wikiResp.status !== 200) {
			resp.status( 503 );
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
}

app.listen( app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
} );


