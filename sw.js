
importScripts('node_modules/serviceworkers-ware/dist/sww.js');
importScripts('node_modules/sww-raw-cache/dist/sww-raw-cache.js');
importScripts('js/simpleStore.js');

// Render Cache
var worker = new ServiceWorkerWare();

// The render cache improves the performance of the most expensive part of
// the app by caching the rendered view for the specific movie.
worker.use('/movie\\.html', new RawCache({ cacheName: 'RenderCache' }));
worker.use('/movie\\.html', function (req, res) {
  return res ? Promise.resolve(res) : fetch(req);
});

// REST API
worker.get('/api/movies/.*', function (request) {
  var pathName = new URL(request.url).pathname;
  var id = pathName.substr(12);
  var cors = 'http://crossorigin.me/';
  return fetch(cors + 'http://www.omdbapi.com?plot=full&i=' + id);
});

worker.get('/api/favourites$', function () {
  var options = { headers: { 'Content-Type': 'application/json' } };
  return simpleStore.getRaw('favourites')
  .then(function (favourites) {
    favourites = favourites || "[]";
    return new Response(favourites, options);
  });
});

worker.put('/api/favourites/.+', function (request) {
  return request.clone().json()
  .then(storeMovieAsFavourite);

  function storeMovieAsFavourite(movie) {
    return simpleStore.get('favourites')
    .then(function (favouriteList) {
      favouriteList = favouriteList || [];
      var found = findIndex(favouriteList, movie.imdbID) >= 0;
      !found && favouriteList.push(movie);
      return favouriteList;
    })
    .then(function (favouriteList) {
      return simpleStore.set('favourites', favouriteList);
    })
    .then(function () {
      return new Response({ status: 201 });
    });
  }
});

worker.delete('/api/favourites/.+', function (request) {
  var pathName = new URL(request.url).pathname;
  var id = pathName.substr(16);
  return findAndRemoveFavourite(id);

  function findAndRemoveFavourite(id) {
    return simpleStore.get('favourites')
    .then(function (favouriteList) {
      var target = findIndex(favouriteList, id);
      if (target >= 0) { favouriteList.splice(target, 1); }
      return favouriteList;
    })
    .then(function (favouriteList) {
      return simpleStore.set('favourites', favouriteList);
    })
    .then(function () {
      return new Response({ status: 204 });
    });
  }
});

worker.get('/api/favourites/.+', function (request) {
  var pathName = new URL(request.url).pathname;
  var id = pathName.substr(16);
  return findMovie(id);

  function findMovie(id) {
    return simpleStore.get('favourites')
    .then(function (favouriteList) {
      favouriteList = favouriteList || [];
      return favouriteList[findIndex(favouriteList, id)];
    })
    .then(function (movie) {
      var found = !!movie;
      var body = found ? JSON.stringify(movie) : undefined;
      var options = {
        headers: { 'Content-Type': 'application/json' },
        status: found ? 200 : 404
      };
      return new Response(body, options);
    });
  }
});

function findIndex(favourites, id) {
  for (var i = 0, fav; fav = favourites[i]; i++) {
    if (fav.imdbID === id) { break; }
  }
  return i === favourites.length ? -1 : i;
}

// Offline cache
importScripts('/resources.js');
worker.use(new self.StaticCacher(RESOURCES));
worker.use(new self.SimpleOfflineCache());

worker.init();
