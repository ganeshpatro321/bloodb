var Module = require('module');

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function loadWithMocks(modulePath, mocks) {
  var resolvedModulePath = require.resolve(modulePath);
  var originalLoad = Module._load;

  delete require.cache[resolvedModulePath];

  Module._load = function(request, parent, isMain) {
    var resolvedRequest;

    if (hasOwn(mocks, request)) {
      return mocks[request];
    }

    try {
      resolvedRequest = Module._resolveFilename(request, parent, isMain);
    } catch (err) {
      resolvedRequest = null;
    }

    if (resolvedRequest && hasOwn(mocks, resolvedRequest)) {
      return mocks[resolvedRequest];
    }

    return originalLoad.apply(this, arguments);
  };

  try {
    return require(resolvedModulePath);
  } finally {
    Module._load = originalLoad;
  }
}

module.exports = loadWithMocks;
