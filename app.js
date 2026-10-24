App({
  onLaunch() {
    // 读取设备信息，供自定义导航栏使用
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      this.globalData.statusBarHeight = info.statusBarHeight || 20;
      this.globalData.screenWidth = info.windowWidth || 375;
    } catch (e) {
      this.globalData.statusBarHeight = 20;
      this.globalData.screenWidth = 375;
    }
  },
  globalData: {
    statusBarHeight: 20,
    screenWidth: 375
  }
});
