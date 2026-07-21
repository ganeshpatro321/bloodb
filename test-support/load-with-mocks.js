var Module = require('node:module');

module.exports = function loadWithMocks(modulePath, mocks) {
  var resolvedPath = require.resolve(modulePath);
  var originalLoad = Module._load;

  delete require.cache[resolvedPath];
  Module._load = function(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(resolvedPath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[resolvedPath];
  }
};
