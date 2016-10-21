self.addEventListener( 'push', function( event ) {
  var icon = 'https://en.m.wikipedia.org/static/apple-touch/commons.png';
  var tag = 'wikimedia-reader-notification';

	fetch( '/api/articles/potd' ).then( function ( resp ) {
		if (resp.status !== 200) {
			throw new Error();
		}
		resp.json().then( function ( page ) {
			self.registration.showNotification( "Photo of the day.", {
				body: "The latest photo of the day - " + page.title + " - is now available for your viewing pleasure. What delight awaits you?",
				icon: page.thumbnail ? page.thumbnail.source : icon,
				tag: tag,
				data: 'https://trending.wmflabs.org/en.commons/' + page.title + '?referrer=pushipedia'
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