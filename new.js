const wifi = require('node-wifi');
wifi.init({
  iface: null
});
wifi.scan()
  .then(networks => {
    console.log(networks)
  })
  .catch(error => {
    console.error('เกิดข้อผิดพลาดในการสแกน:', error);
  });
