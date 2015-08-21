self.addEventListener( 'push', function( event ) {
  var icon = 'https://en.m.wikipedia.org/static/apple-touch/commons.png';
  var tag = 'wikimedia-reader-notification';

	console.log('potd');
	fetch( '/api/articles/potd' ).then( function ( resp ) {
		if (resp.status !== 200) {
			console.log( 'oh no.');
			throw new Error();
		}
		resp.json().then( function ( page ) {
			console.log( 'sending notification...');
			// wait until promise	 gets fulfilled
			self.registration.showNotification( "Photo of the day.", {
				body: "The latest photo of the day is now available for your viewing pleasure. What delight awaits you?",
				icon: icon,
				tag: tag,
				data: 'https://commons.wikimedia.org/wiki/' + page.title
		 } )
		} );
	} );
} );

self.addEventListener( 'notificationclick', function( event ) {
  // Android doesn’t close the notification when you click on it
  // See: http://crbug.com/463146
  event.notification.close();
	return clients.openWindow(event.notification.data);
} );