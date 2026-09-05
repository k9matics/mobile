"use strict";

const Storage = (() => {
  let lastSamples = [];

  function setSamples(samples) {
    lastSamples = Array.isArray(samples) ? [...samples] : [];
  }

  function getSamples() {
    return [...lastSamples];
  }

  function clear() {
    lastSamples = [];
  }

  return {
    setSamples,
    getSamples,
    clear
  };
})();
