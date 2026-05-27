import React, { useState, useEffect, useRef } from "react";
import { 
  Bell, 
  X, 
  Check, 
  CheckCircle, 
  AlertOctagon, 
  Clock, 
  Archive, 
  Trash2, 
  Volume2, 
  VolumeX,
  FileText
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface PlatformNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  status: string; // unread, read
  metadata?: any;
  created_at: string;
  related_entity_type?: string;
}

export const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<PlatformNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => n.status === "unread").length;

  const loadNotifications = async () => {
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch("/api/notifications", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNotifications(data.notifications || []);
      }
    } catch (err) {
      console.error("[NOTIFICATION BELL] Error loading notifications:", err);
    }
  };

  const markAllAsRead = async () => {
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch("/api/notifications/read-all", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, status: "read" })));
        toast.success("Todas as notificações marcadas como lidas.");
      }
    } catch (err) {
      console.error("[NOTIFICATION BELL] Error marking all as read:", err);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: "read" } : n));
      }
    } catch (err) {
      console.error("[NOTIFICATION BELL] Error marking notification as read:", err);
    }
  };

  // Sound generator using native audio synthesis context (no static assets needed!)
  const playPingSound = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5 note
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5 note
      
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch (err) {
      // Audio context might be blocked by browser user gesture policies
    }
  };

  useEffect(() => {
    loadNotifications();

    // Setup direct real-time EventSource listener
    let sse: EventSource | null = null;
    try {
      const token = localStorage.getItem("token") || "";
      sse = new EventSource(`/api/omnichannel/stream?token=${token}`);

      sse.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          
          if (payload.event === "notification.created") {
            const newNotif = payload.data as PlatformNotification;
            setNotifications(prev => {
              // Avoid duplicates
              if (prev.some(n => n.id === newNotif.id)) return prev;
              
              playPingSound();
              toast.info(newNotif.title, {
                description: newNotif.message,
                duration: 5000
              });
              
              return [newNotif, ...prev];
            });
          } else if (payload.event === "notification.updated") {
            const { id, status } = payload.data;
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, status } : n));
          } else if (payload.event === "notifications.read_all") {
            setNotifications(prev => prev.map(n => ({ ...n, status: "read" })));
          }
        } catch (err) {
          // parse ignore
        }
      };

      sse.onerror = () => {
        // Safe closed reconnect handler handles automatically
      };
    } catch (err) {
      console.error("[SSE] Failed to establish notifications subscription", err);
    }

    // Backup interval polling (defensive setup)
    const backupInterval = setInterval(loadNotifications, 20000);

    // Click outside handler
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      if (sse) sse.close();
      clearInterval(backupInterval);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [soundEnabled]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "template_approved":
      case "whatsapp_template_approved":
        return (
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle className="w-4 h-4" />
          </div>
        );
      case "template_rejected":
      case "whatsapp_template_rejected":
        return (
          <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
            <AlertOctagon className="w-4 h-4" />
          </div>
        );
      case "template_submitted":
      case "whatsapp_template_submitted":
      case "whatsapp_template_pending":
        return (
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
            <Clock className="w-4 h-4" />
          </div>
        );
      default:
        return (
          <div className="p-2 bg-slate-50 text-slate-500 rounded-xl">
            <Bell className="w-4 h-4" />
          </div>
        );
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-xl transition-all border border-slate-100 shadow-sm active:scale-95"
        title="Notificações do Sistema"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="absolute right-0 mt-3 w-80 lg:w-96 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 flex flex-col max-h-[480px] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-50 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase text-slate-800 tracking-wider">Notificações</span>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-rose-100 text-rose-600 rounded-full text-[10px] font-black uppercase">
                    {unreadCount} Novas
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  title={soundEnabled ? "Mutar sons" : "Ativar sons"}
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-rose-500" />}
                </button>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Marcar todas como lidas"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50 custom-scrollbar max-h-[360px]">
              {notifications.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <Bell className="w-8 h-8 text-slate-300 mx-auto animate-pulse" />
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">Tudo limpo por aqui</p>
                  <p className="text-[10px] text-slate-400">Você não possui notificações no momento.</p>
                </div>
              ) : (
                (() => {
                  const seen = new Set<string>();
                  return notifications.filter((notif) => {
                    if (!notif.id) return false;
                    if (seen.has(notif.id)) return false;
                    seen.add(notif.id);
                    return true;
                  });
                })().map((notif) => (
                  <div
                    key={notif.id}
                    onClick={() => markAsRead(notif.id)}
                    className={`p-4 flex flex-col gap-3 transition-colors text-left hover:bg-slate-50/55 cursor-pointer relative ${
                      notif.status === "unread" ? "bg-blue-50/15" : ""
                    }`}
                  >
                    <div className="flex gap-3">
                      {getNotificationIcon(notif.type)}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-black text-slate-800 truncate">{notif.title}</p>
                          <span className="text-[9px] text-slate-400 self-start shrink-0 font-medium">
                            {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-normal line-clamp-2">{notif.message}</p>
                        
                        {notif.metadata?.template_name && (
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-50 border border-slate-100 rounded-md text-[9px] text-slate-500 font-mono mt-1">
                            <FileText className="w-3 h-3 text-slate-400" />
                            {notif.metadata.template_name}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Button "Abrir modelo" if related to whatsapp template status update */}
                    {(notif.related_entity_type === "whatsapp_message_template" || 
                      notif.metadata?.related_entity_type === "whatsapp_message_template" ||
                      notif.type?.includes("whatsapp_template")) && (
                      <div className="pl-11 pt-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead(notif.id);
                            setIsOpen(false);
                            navigate('/app/ajustes/modelos');
                          }}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 font-black text-[10px] tracking-wider uppercase rounded-lg transition-colors flex items-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Abrir Modelo
                        </button>
                      </div>
                    )}

                    {notif.status === "unread" && (
                      <span className="absolute left-2 top-2 w-1.5 h-1.5 bg-blue-600 rounded-full" />
                    )}
                  </div>
                ))
              )}
            </div>
            
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
