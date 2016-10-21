self.addEventListener( 'push', function( event ) {
  var icon = 'https://en.m.wikipedia.org/static/apple-touch/wikipedia.png';
  var tag = 'wikipedia-reader-notification';

	fetch( '/api/articles/yta' ).then( function ( resp ) {
		if (resp.status !== 200) {
			throw new Error();
		}
		resp.json().then( function ( page ) {
			self.registration.showNotification( 'Yesterday\'s most read on Wikipedia', {
				body: 'The most read article on Wikipedia yesterday was ' + page.title + '\n\n' + page.extract,
				icon: page.thumbnail ? page.thumbnail.source : icon,
				tag: tag,
				data: 'https://trending.wmflabs.org/wiki/' + page.title + '?referrer=pushipedia'
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