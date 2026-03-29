export const ipc = window.electron || new Proxy({}, {
  get: (target, prop) => {
    return async (...args) => {
      console.warn(`[IPC Mock] Called ${prop} with args:`, args);
      return null;
    };
  }
});

export default ipc;