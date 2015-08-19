self.addEventListener( 'push', function( event ) {
  var icon = 'https://en.m.wikipedia.org/static/apple-touch/wikipedia.png';
  var tag = 'wikipedia-reader-notification';

	console.log( 'we are here' );
	fetch( '/api/articles/tfa' ).then( function ( resp ) {
		if (resp.status !== 200) {
			console.log( 'oh no.');
			throw new Error();
		}
		resp.json().then( function ( page ) {
			console.log( 'sending notification...');
				// wait until promise	 gets fulfilled
			event.waitUntil(
				self.registration.showNotification( page.title, {
					body: page.extract,
					icon: icon,
					tag: tag,
					data: 'https://en.wikipedia.org/wiki/' + page.title
			 } )
			);
		} );
	} );
} );

self.addEventListener( 'notificationclick', function( event ) {
  // Android doesn’t close the notification when you click on it
  // See: http://crbug.com/463146
  event.notification.close();
	return clients.openWindow(event.notification.data);
} );