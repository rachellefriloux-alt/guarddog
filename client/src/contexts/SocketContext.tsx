import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface MotionAlert {
  cameraId: number;
  eventType: string;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  timestamp: number;
}

interface CameraStatus {
  cameraId: number;
  status: 'online' | 'offline' | 'error';
  error?: string;
  timestamp: number;
}

interface AIDetectionResult {
  cameraId: number;
  objects: Array<{
    type: string;
    confidence: number;
    boundingBox: any;
  }>;
  image: string;
  timestamp: number;
}

interface SystemAlert {
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  timestamp: number;
}

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  motionAlerts: MotionAlert[];
  cameraStatuses: Map<number, CameraStatus>;
  aiDetections: AIDetectionResult[];
  systemAlerts: SystemAlert[];
  joinCamera: (cameraId: number) => void;
  leaveCamera: (cameraId: number) => void;
  clearAlerts: () => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3001';

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const { token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [motionAlerts, setMotionAlerts] = useState<MotionAlert[]>([]);
  const [cameraStatuses, setCameraStatuses] = useState<Map<number, CameraStatus>>(new Map());
  const [aiDetections, setAIDetections] = useState<AIDetectionResult[]>([]);
  const [systemAlerts, setSystemAlerts] = useState<SystemAlert[]>([]);

  useEffect(() => {
    if (token) {
      const newSocket = io(SOCKET_URL, {
        auth: {
          token
        }
      });

      newSocket.on('connect', () => {
        console.log('Connected to server');
        setConnected(true);
      });

      newSocket.on('disconnect', () => {
        console.log('Disconnected from server');
        setConnected(false);
      });

      newSocket.on('motion-alert', (data: MotionAlert) => {
        setMotionAlerts(prev => [data, ...prev.slice(0, 49)]); // Keep last 50 alerts
      });

      newSocket.on('camera-status-update', (data: CameraStatus) => {
        setCameraStatuses(prev => {
          const newMap = new Map(prev);
          newMap.set(data.cameraId, data);
          return newMap;
        });
      });

      newSocket.on('ai-detection-result', (data: AIDetectionResult) => {
        setAIDetections(prev => [data, ...prev.slice(0, 19)]); // Keep last 20 detections
      });

      newSocket.on('system-alert', (data: SystemAlert) => {
        setSystemAlerts(prev => [data, ...prev.slice(0, 9)]); // Keep last 10 system alerts
      });

      newSocket.on('recording-update', (data: any) => {
        console.log('Recording update:', data);
      });

      newSocket.on('stream-frame', (data: any) => {
        // Handle incoming video frames
        console.log('Stream frame received for camera:', data.cameraId);
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
        setSocket(null);
        setConnected(false);
      };
    }
  }, [token]);

  const joinCamera = (cameraId: number) => {
    if (socket) {
      socket.emit('join-camera', cameraId);
    }
  };

  const leaveCamera = (cameraId: number) => {
    if (socket) {
      socket.emit('leave-camera', cameraId);
    }
  };

  const clearAlerts = () => {
    setMotionAlerts([]);
    setSystemAlerts([]);
    setAIDetections([]);
  };

  const value: SocketContextType = {
    socket,
    connected,
    motionAlerts,
    cameraStatuses,
    aiDetections,
    systemAlerts,
    joinCamera,
    leaveCamera,
    clearAlerts
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};