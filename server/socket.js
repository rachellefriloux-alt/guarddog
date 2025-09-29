const setupSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);
    
    // Join camera room for live streaming
    socket.on('join-camera', (cameraId) => {
      socket.join(`camera-${cameraId}`);
      console.log(`📹 Client ${socket.id} joined camera ${cameraId}`);
    });
    
    // Leave camera room
    socket.on('leave-camera', (cameraId) => {
      socket.leave(`camera-${cameraId}`);
      console.log(`📹 Client ${socket.id} left camera ${cameraId}`);
    });
    
    // Handle video stream data
    socket.on('stream-data', (data) => {
      const { cameraId, frameData } = data;
      // Broadcast to all clients watching this camera
      socket.to(`camera-${cameraId}`).emit('stream-frame', {
        cameraId,
        frameData,
        timestamp: Date.now()
      });
    });
    
    // Handle motion detection alerts
    socket.on('motion-detected', (data) => {
      const { cameraId, eventType, confidence, boundingBox } = data;
      
      // Broadcast motion alert to all connected clients
      io.emit('motion-alert', {
        cameraId,
        eventType,
        confidence,
        boundingBox,
        timestamp: Date.now()
      });
      
      console.log(`🚨 Motion detected on camera ${cameraId}: ${eventType} (${confidence})`);
    });
    
    // Handle recording status updates
    socket.on('recording-status', (data) => {
      const { cameraId, isRecording, filename } = data;
      
      // Broadcast recording status to all clients
      io.emit('recording-update', {
        cameraId,
        isRecording,
        filename,
        timestamp: Date.now()
      });
    });
    
    // Handle camera status updates
    socket.on('camera-status', (data) => {
      const { cameraId, status, error } = data;
      
      // Broadcast camera status to all clients
      io.emit('camera-status-update', {
        cameraId,
        status, // 'online', 'offline', 'error'
        error,
        timestamp: Date.now()
      });
    });
    
    // Handle AI detection results
    socket.on('ai-detection', (data) => {
      const { cameraId, objects, image } = data;
      
      // Broadcast AI detection results
      io.emit('ai-detection-result', {
        cameraId,
        objects,
        image,
        timestamp: Date.now()
      });
    });
    
    // Handle client requests for camera list
    socket.on('request-camera-list', () => {
      // This would typically fetch from database
      // For now, emit a sample response
      socket.emit('camera-list', {
        cameras: [],
        timestamp: Date.now()
      });
    });
    
    // Handle system status requests
    socket.on('request-system-status', () => {
      socket.emit('system-status', {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: Date.now()
      });
    });
    
    // Handle disconnect
    socket.on('disconnect', (reason) => {
      console.log(`🔌 Client disconnected: ${socket.id} (${reason})`);
    });
    
    // Error handling
    socket.on('error', (error) => {
      console.error(`❌ Socket error from ${socket.id}:`, error);
    });
  });
  
  // Broadcast system-wide events
  const broadcastSystemAlert = (message, type = 'info') => {
    io.emit('system-alert', {
      message,
      type, // 'info', 'warning', 'error', 'success'
      timestamp: Date.now()
    });
  };
  
  return {
    broadcastSystemAlert
  };
};

module.exports = {
  setupSocketHandlers
};