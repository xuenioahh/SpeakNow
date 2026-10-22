import { useEffect, useRef, useState } from "react";
import { CameraOff, Loader2 } from "lucide-react";

export default function CameraPreview() {
  const videoRef = useRef(null);
  const [status, setStatus] = useState("loading"); // loading | active | error

  useEffect(() => {
    let stream = null;
    let active = true;
    
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setStatus("active");
        }
      } catch {
        setStatus("error");
      }
    };

    start();

    return () => {
      active = false;
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  if (status === "error") {
    return (
      <div className="glass rounded-xl aspect-video flex items-center justify-center">
        <div className="text-center">
          <CameraOff className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
          <p className="text-[9px] text-muted-foreground">No camera</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl overflow-hidden aspect-video relative">
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
        </div>
      )}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={{ display: status === "active" ? "block" : "none" }}
      />
    </div>
  );
}
