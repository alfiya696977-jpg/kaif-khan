import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { 
  LayoutDashboard, 
  CloudUpload, 
  BookOpen, 
  TrendingUp, 
  Settings, 
  PlusCircle, 
  HelpCircle, 
  Shield, 
  Search, 
  Bell, 
  FileText, 
  FileCode, 
  PlayCircle, 
  CheckCircle2, 
  PlusSquare, 
  Zap, 
  Sparkles,
  MessageSquare,
  SlidersHorizontal,
  Send,
  Loader2,
  ChevronLeft,
  Award,
  LogIn,
  LogOut,
  Camera,
  AlertTriangle,
  UserCheck,
  User,
  Volume2,
  VolumeX
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Firebase ---
import { auth, db, signInWithGoogle, logout, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  setDoc, 
  doc, 
  serverTimestamp, 
  orderBy,
  limit,
  Timestamp,
  getDocs
} from 'firebase/firestore';

// --- Gemini Service ---
import * as geminiService from './services/geminiService';

// --- Types ---

interface ContentItem {
  id: string;
  title: string;
  description: string;
  type: 'pdf' | 'notes' | 'video' | 'practice';
  progress: number;
  tag?: string;
  activeSync?: boolean;
  fullContent?: string;
}

interface Message {
  role: 'teacher' | 'student';
  text: string;
  timestamp: Date;
}

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'admin' | 'user';
  bio?: string;
  joinedAt?: any;
}

// --- Mock Data ---

const MOCK_CONTENT: ContentItem[] = [
  {
    id: '1',
    title: 'Advanced Quantum Mechanics',
    description: 'Comprehensive guide on wave-particle duality, Schrodinger equations, and probability amplitudes.',
    type: 'pdf',
    progress: 85,
    activeSync: true,
    fullContent: `Quantum mechanics is a fundamental theory in physics that provides a description of the physical properties of nature at the scale of atoms and subatomic particles. It is the foundation of all quantum physics including quantum chemistry, quantum field theory, quantum technology, and quantum information science.
    
    Wave-particle duality is the concept in quantum mechanics that every particle or quantum entity may be described as either a particle or a wave. It expresses the inability of the classical concepts "particle" or "wave" to fully describe the behavior of quantum-scale objects.
    
    The Schrödinger equation is a linear partial differential equation that governs the wave function of a quantum-mechanical system. It is a key result in quantum mechanics, and its discovery was a significant landmark in the development of the subject.`
  },
  {
    id: '2',
    title: 'Neural Network Architectures',
    description: 'Exploration of transformers, CNNs, and the mathematical foundations of backpropagation.',
    type: 'notes',
    progress: 42,
    tag: 'Lecture Notes',
    fullContent: `Neural networks, also known as artificial neural networks (ANNs) or simulated neural networks (SNNs), are a subset of machine learning and are at the heart of deep learning algorithms. Their name and structure are inspired by the human brain, mimicking the way that biological neurons signal to one another.
    
    Convolutional Neural Networks (CNNs) are a type of deep learning algorithm that can take in an input image, assign importance (learnable weights and biases) to various aspects/objects in the image, and be able to differentiate one from the other.
    
    Transformers are a type of deep learning model that adopted the mechanism of self-attention, differentially weighting the significance of each part of the input data. It is used primarily in the fields of natural language processing (NLP) and computer vision (CV).`
  },
  {
    id: '3',
    title: 'Macroeconomics & Markets',
    description: 'Visual breakdown of fiscal policy, supply chains, and international trade dynamics.',
    type: 'video',
    progress: 15,
    tag: 'Presentation',
    fullContent: `Macroeconomics is a branch of economics dealing with the performance, structure, behavior, and decision-making of an economy as a whole. This includes regional, national, and global economies.
    
    Fiscal policy is the use of government revenue collection (taxes or tax cuts) and expenditure (spending) to influence a country's economy.
    
    Supply chain management is the management of the flow of goods and services and includes all processes that transform raw materials into final products. It involves the active streamlining of a business's supply-side activities to maximize customer value and gain a competitive advantage in the marketplace.`
  },
  {
    id: '4',
    title: 'Organic Chemistry Reagents',
    description: 'AI-curated practice problems for identifying functional groups and reaction pathways.',
    type: 'practice',
    progress: 100,
    tag: 'Practice Set',
    fullContent: `Organic chemistry is a branch of chemistry that studies the structure, properties and reactions of organic compounds, which contain carbon in covalent bonding. Study of structure determines their structural formula.
    
    Functional groups are specific groupings of atoms within molecules that have their own characteristic properties, regardless of the other atoms present in a molecule. Common examples include alcohols, amines, carboxylic acids, and ketones.
    
    Reaction pathways describe the sequence of steps in a chemical reaction. In organic chemistry, this often involves understanding nucleophiles, electrophiles, and the movement of electrons.`
  }
];

// --- Components ---

const FocusMonitor = () => {
  const [faceDetected, setFaceDetected] = useState(true);
  const [focusScore, setFocusScore] = useState(85);
  const [durationLowFocus, setDurationLowFocus] = useState(0);
  const [status, setStatus] = useState<any>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const startMonitoring = async () => {
    setError(null);
    setIsInitializing(true);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Not Supported');
      setIsInitializing(false);
      return;
    }

    // Proactive permission check if supported
    if (navigator.permissions && (navigator.permissions as any).query) {
      try {
        const result = await (navigator.permissions as any).query({ name: 'camera' });
        if (result.state === 'denied') {
          setError('Permission Denied');
          setIsInitializing(false);
          return;
        }
      } catch (e) {
        console.warn("Permission query not supported for camera", e);
      }
    }

    try {
      console.log("Requesting camera access...");
      const streamData = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 }
        } 
      }).catch(async (err) => {
        console.warn("Ideal constraints failed, trying basic video: true", err);
        return await navigator.mediaDevices.getUserMedia({ video: true });
      });
      console.log("Camera access granted:", streamData.id);
      setStream(streamData);
      setIsMonitoring(true);
    } catch (err: any) {
      console.error("Error accessing camera:", err);
      let msg = 'Camera Error';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Permission Denied';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No Camera Found';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'Camera in Use';
      }
      setError(msg);
      setTimeout(() => setError(null), 8000);
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    if (isMonitoring && videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(e => console.error("Video play failed:", e));
    }
  }, [isMonitoring, stream]);

  const stopMonitoring = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    setStream(null);
    setIsMonitoring(false);
    setStatus(null);
  };

  useEffect(() => {
    let interval: any;
    if (isMonitoring) {
      interval = setInterval(async () => {
        // Simulate focus data logic
        setFocusScore(prev => {
          const change = Math.floor(Math.random() * 21) - 10; // -10 to +10
          const next = Math.min(100, Math.max(0, prev + (faceDetected ? change + 2 : change - 5)));
          return next;
        });

        if (focusScore < 40) {
          setDurationLowFocus(prev => prev + 2);
        } else {
          setDurationLowFocus(0);
        }

        try {
          const response = await geminiService.monitorFocus(faceDetected, focusScore, durationLowFocus);
          setStatus(response);

          if (voiceEnabled && response.voice && 'speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(response.voice);
            window.speechSynthesis.speak(utterance);
          }
        } catch (e) {
          console.error("Focus monitor API failed:", e);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isMonitoring, faceDetected, focusScore, durationLowFocus]);

  return (
    <div className="fixed bottom-6 left-6 z-50 flex flex-col items-start space-y-4">
      <AnimatePresence>
        {status && status.status !== 'focused' && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`p-4 rounded-2xl shadow-2xl border-2 flex items-center space-x-4 max-w-xs ${
              status.status === 'critical' 
                ? 'bg-red-900/90 border-red-500 text-white' 
                : 'bg-amber-900/90 border-amber-500 text-white'
            }`}
          >
            <AlertTriangle className={`w-6 h-6 ${status.status === 'critical' ? 'animate-bounce' : 'animate-pulse'}`} />
            <div>
              <p className="font-bold text-sm uppercase tracking-wider">{status.status}</p>
              <p className="text-xs opacity-90">{status.message}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative group">
        <div className={`w-32 h-32 rounded-2xl overflow-hidden border-2 transition-all duration-500 ${
          isMonitoring ? (focusScore < 40 ? 'border-amber-500 shadow-lg shadow-amber-500/20' : 'border-primary shadow-lg shadow-primary/20') : 'border-slate-800'
        }`}>
          {isMonitoring ? (
            <video 
              key={stream?.id || 'no-stream'}
              ref={(el) => {
                if (el && stream && el.srcObject !== stream) {
                  console.log("Attaching stream via callback ref");
                  el.srcObject = stream;
                  el.play().catch(e => console.error("Video play failed:", e));
                }
                (videoRef as any).current = el;
              }}
              autoPlay 
              muted 
              playsInline 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center p-2 text-center">
              {isInitializing ? (
                <div className="flex flex-col items-center space-y-2">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-[8px] text-slate-500 uppercase tracking-widest">Initializing...</p>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center space-y-1">
                  <p className="text-[10px] font-bold text-red-500 uppercase leading-tight">{error}</p>
                  {error === 'Permission Denied' && (
                    <p className="text-[7px] text-slate-500 leading-tight mb-1">Please enable camera in browser settings</p>
                  )}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      startMonitoring();
                    }}
                    className="text-[8px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full hover:bg-red-500/40 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <Camera className="w-8 h-8 text-slate-700" />
              )}
            </div>
          )}
          
          {isMonitoring && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-2 left-2 flex space-x-1">
                <div className={`w-1.5 h-1.5 rounded-full ${faceDetected ? 'bg-green-500' : 'bg-red-500 animate-ping'}`}></div>
              </div>
              <div className="absolute bottom-2 right-2">
                <p className={`text-[10px] font-black ${focusScore < 40 ? 'text-amber-500' : 'text-primary'}`}>{focusScore}%</p>
              </div>
            </div>
          )}
        </div>

        <div className="absolute -top-2 -right-2 flex flex-col space-y-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={isMonitoring ? stopMonitoring : startMonitoring}
            className={`p-2 rounded-full shadow-lg transition-all relative ${
              isMonitoring ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-primary text-on-primary hover:scale-110'
            }`}
          >
            {!isMonitoring && (
              <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-20"></span>
            )}
            {isMonitoring ? <LogOut className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
          </button>
          {isMonitoring && (
            <>
              <button 
                onClick={() => setFaceDetected(!faceDetected)}
                className={`p-2 rounded-full shadow-lg transition-all ${
                  faceDetected ? 'bg-slate-800 text-slate-400' : 'bg-amber-500 text-white'
                }`}
                title="Toggle Face Detection (Simulate)"
              >
                <UserCheck className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                className={`p-2 rounded-full shadow-lg transition-all ${
                  voiceEnabled ? 'bg-primary text-on-primary' : 'bg-slate-800 text-slate-400'
                }`}
                title={voiceEnabled ? "Mute Voice Feedback" : "Unmute Voice Feedback"}
              >
                {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const Sidebar = ({ onNavClick, activeNav, onUploadClick }: { onNavClick: (nav: string) => void, activeNav: string, onUploadClick: () => void }) => {
  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard' },
    { icon: User, label: 'Profile' },
    { icon: CloudUpload, label: 'Upload Content' },
    { icon: BookOpen, label: 'My Learning' },
    { icon: TrendingUp, label: 'Performance' },
    { icon: Settings, label: 'Settings' },
  ];

  return (
    <aside className="h-screen w-64 fixed left-0 top-0 z-40 bg-surface flex flex-col py-8 space-y-2 border-r border-outline-variant/15 stitched-x">
      <div className="px-8 mb-12 flex items-center space-x-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-lg shadow-primary/5">
          <Sparkles className="text-primary w-5 h-5" />
        </div>
        <div>
          <h1 className="font-headline font-black text-on-surface leading-none text-xl tracking-tight">AutoMentor</h1>
          <p className="text-[10px] text-primary font-bold uppercase tracking-[0.2em] mt-1 opacity-70">Ethereal AI</p>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1.5">
        {navItems.map((item) => (
          <button
            key={item.label}
            onClick={() => {
              if (item.label === 'Upload Content') {
                onUploadClick();
              } else {
                onNavClick(item.label);
              }
            }}
            className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-2xl transition-all duration-300 group relative overflow-hidden ${
              activeNav === item.label
                ? 'bg-primary/10 text-primary border border-primary/20 active-nav-glow'
                : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
            }`}
          >
            <item.icon className={`w-5 h-5 transition-transform duration-300 group-hover:scale-110 ${
              activeNav === item.label ? 'text-primary' : 'text-on-surface-variant'
            }`} />
            <span className="font-label font-bold text-sm tracking-tight">{item.label}</span>
            {activeNav === item.label && (
              <motion.div 
                layoutId="nav-pill"
                className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shadow-lg shadow-primary/40"
              />
            )}
          </button>
        ))}
      </nav>

      <div className="px-4 mt-auto">
        <button 
          onClick={onUploadClick}
          className="w-full hyper-gradient-btn text-on-primary font-black py-4.5 rounded-2xl shadow-xl shadow-primary/20 flex items-center justify-center space-x-3 hover:scale-[1.02] active:scale-[0.98] transition-all group"
        >
          <PlusCircle className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
          <span className="text-sm uppercase tracking-widest">Add Content</span>
        </button>
      </div>
    </aside>
  );
};

const Header = ({ user, profile }: { user: FirebaseUser | null, profile: UserProfile | null }) => {
  return (
    <header className="h-20 fixed top-0 right-0 left-64 z-30 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/15 flex items-center justify-between px-12 stitched-y">
      <div className="flex items-center space-x-6 flex-1 max-w-2xl">
        <div className="relative w-full group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant group-focus-within:text-primary transition-colors" />
          <input 
            type="text" 
            placeholder="Search your library, topics, or mentor insights..." 
            className="w-full bg-surface-container border border-outline-variant/10 rounded-2xl py-3 pl-12 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/30 focus:ring-4 focus:ring-primary/5 transition-all"
          />
        </div>
      </div>

      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-2">
          <button className="p-2.5 rounded-xl hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-all relative border border-transparent hover:border-outline-variant/10">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-primary rounded-full border-2 border-surface shadow-sm"></span>
          </button>
          <button className="p-2.5 rounded-xl hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-all border border-transparent hover:border-outline-variant/10">
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>
        
        <div className="w-[1px] h-8 bg-outline-variant/20"></div>

        <div className="flex items-center space-x-4 pl-2">
          {user && (
            <>
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-on-surface leading-none">{profile?.displayName || user.displayName}</p>
                <p className="text-[10px] text-primary font-black uppercase tracking-widest mt-1 opacity-70">
                  {profile?.role === 'admin' ? 'System Architect' : 'Pro Learner'}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl overflow-hidden border-2 border-primary/20 shadow-lg shadow-primary/5">
                <img 
                  src={profile?.photoURL || user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`} 
                  alt="Profile" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            </>
          )}
          <button 
            onClick={() => logout()}
            className="p-2.5 rounded-xl hover:bg-error/10 text-on-surface-variant hover:text-error transition-all border border-transparent hover:border-error/20"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

const ContentCard: React.FC<{ item: ContentItem, onStudy: (item: ContentItem) => void }> = ({ item, onStudy }) => {
  const Icon = item.type === 'pdf' ? FileText : item.type === 'notes' ? FileCode : item.type === 'video' ? PlayCircle : CheckCircle2;
  const colorClass = item.type === 'pdf' ? 'text-primary' : item.type === 'notes' ? 'text-secondary' : item.type === 'video' ? 'text-tertiary' : 'text-primary';
  const bgClass = item.type === 'pdf' ? 'bg-primary/10' : item.type === 'notes' ? 'bg-secondary/10' : item.type === 'video' ? 'bg-tertiary/10' : 'bg-primary/10';
  const borderHoverClass = item.type === 'pdf' ? 'hover:border-primary/40' : item.type === 'notes' ? 'hover:border-secondary/40' : item.type === 'video' ? 'hover:border-tertiary/40' : 'hover:border-primary/40';
  const shadowClass = item.type === 'pdf' ? 'shadow-primary/5' : item.type === 'notes' ? 'shadow-secondary/5' : item.type === 'video' ? 'shadow-tertiary/5' : 'shadow-primary/5';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      className={`glass-card rounded-2xl p-8 border border-outline-variant/15 group ${borderHoverClass} transition-all duration-500 flex flex-col shadow-lg ${shadowClass} stitched-border stitched-x stitched-y`}
    >
      <div className="flex justify-between items-start mb-8">
        <div className={`w-14 h-14 rounded-2xl ${bgClass} flex items-center justify-center ${colorClass} group-hover:scale-110 transition-transform shadow-inner`}>
          <Icon className="w-7 h-7" />
        </div>
        {item.activeSync && (
          <div className="flex items-center space-x-2 bg-surface-container-highest px-4 py-1.5 rounded-full border border-outline-variant/15 shadow-sm">
            <div className="w-2 h-2 rounded-full bg-tertiary animate-pulse shadow-lg shadow-tertiary/40"></div>
            <span className="text-[10px] font-label font-black uppercase tracking-widest text-on-surface-variant">Active Sync</span>
          </div>
        )}
        {item.tag && !item.activeSync && (
          <span className={`text-[10px] font-label font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-sm ${
            item.type === 'notes' ? 'text-secondary-fixed-dim bg-secondary-container/20' : 
            item.type === 'video' ? 'text-on-tertiary-fixed-variant bg-tertiary-container/20' : 
            'text-on-surface-variant bg-surface-container-highest border border-outline-variant/15'
          }`}>
            {item.tag}
          </span>
        )}
      </div>
      
      <h4 className={`font-headline text-2xl font-black text-on-surface mb-3 group-hover:${colorClass} transition-colors tracking-tight`}>
        {item.title}
      </h4>
      <p className="text-on-surface-variant text-sm leading-relaxed line-clamp-2 mb-10 opacity-80">
        {item.description}
      </p>

      <div className="mt-auto space-y-8">
        <div className="space-y-3">
          <div className="flex justify-between text-[10px] font-label font-black uppercase tracking-[0.2em] text-on-surface-variant/70">
            <span>Mastery Level</span>
            <span>{item.progress}%</span>
          </div>
          <div className="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden p-[1px] border border-outline-variant/5">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${item.progress}%` }}
              transition={{ duration: 1.5, ease: "circOut" }}
              className={`h-full bg-gradient-to-r from-primary via-secondary to-tertiary rounded-full ${item.progress === 100 ? 'shadow-[0_0_20px_rgba(125,233,255,0.4)]' : ''}`}
            ></motion.div>
          </div>
        </div>
        
        <button 
          onClick={() => onStudy(item)}
          className={`w-full py-4.5 rounded-2xl text-xs font-black uppercase tracking-[0.2em] border transition-all duration-500 flex items-center justify-center space-x-3 shadow-lg ${
            item.progress === 100 
              ? 'bg-surface-container-highest text-tertiary border-tertiary/20 hover:bg-tertiary/10 shadow-tertiary/5' 
              : 'border-primary/30 text-primary hover:bg-primary hover:text-on-primary shadow-primary/10'
          }`}
        >
          {item.progress === 100 ? (
            <>
              <CheckCircle2 className="w-5 h-5 fill-current" />
              <span>Review Session</span>
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              <span>Begin Session</span>
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
};

const StudySession: React.FC<{ item: ContentItem, onBack: () => void, user: FirebaseUser }> = ({ item, onBack, user }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [isQuizzing, setIsQuizzing] = useState(false);
  const [quizData, setQuizData] = useState<any>(null);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [studentAnswers, setStudentAnswers] = useState<string[]>([]);
  const [currentTopicId, setCurrentTopicId] = useState(0);
  const [lastEvaluation, setLastEvaluation] = useState<any>(null);
  const [evaluation, setEvaluation] = useState<any>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    const initSession = async () => {
      setIsLoading(true);
      try {
        // Create a session document in Firestore
        const sessionRef = doc(collection(db, 'sessions'));
        const sessionId = sessionRef.id;
        
        await setDoc(sessionRef, {
          id: sessionId,
          userId: user.uid,
          contentId: item.id,
          createdAt: serverTimestamp(),
          messages: []
        });
        setSessionId(sessionId);

        const infoResponse = await geminiService.analyzeContent(item.fullContent || '', user.uid);
        const info = infoResponse.data;
        setSessionInfo(info);
        
        if (isVoiceMode) {
          handleNextVoiceLine();
        } else {
          const teachResponse = await geminiService.teachTopic(item.fullContent || '', user.uid, 0, "teach");
          const teachData = teachResponse.data;
          setCurrentTopicId(0);
          const initialMsg: Message = {
            role: 'teacher',
            text: `${teachData.explanation}\n\nExample: ${teachData.example}\n\n${teachData.question}`,
            timestamp: new Date()
          };
          setMessages([initialMsg]);

          // Update session with initial message
          await setDoc(sessionRef, {
            messages: [{
              role: initialMsg.role,
              text: initialMsg.text,
              timestamp: initialMsg.timestamp.toISOString()
            }]
          }, { merge: true });
        }

      } catch (error) {
        console.error("Error initializing session:", error);
        handleFirestoreError(error, OperationType.CREATE, 'sessions');
        setMessages([{
          role: 'teacher',
          text: "I'm sorry, I'm having trouble connecting to my mentor brain. Please try again in a moment.",
          timestamp: new Date()
        }]);
      } finally {
        setIsLoading(false);
      }
    };

    initSession();
  }, [item, user.uid]);

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (!isVoiceMode && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, [isVoiceMode]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const studentMessage: Message = {
      role: 'student',
      text: inputValue,
      timestamp: new Date()
    };

    const updatedMessages = [...messages, studentMessage];
    setMessages(updatedMessages);
    setInputValue('');
    setIsLoading(true);

    try {
      if (inputValue.toLowerCase().includes('quiz')) {
        const quizResponse = await geminiService.generateQuiz(item.fullContent || '', user.uid);
        const quiz = quizResponse.data;
        setQuizData(quiz);
        setIsQuizzing(true);
        setCurrentQuizIndex(0);
        setStudentAnswers([]);
      } else if (isVoiceMode && inputValue.toLowerCase() === 'next') {
        await handleNextVoiceLine();
      } else {
        // Evaluate the student's answer to the current topic's question
        const evalResponse = await geminiService.evaluateAnswer(item.fullContent || '', user.uid, currentTopicId, inputValue);
        const evalData = evalResponse.data;
        setLastEvaluation(evalData);

        let teacherMsg: Message;
        let nextMessages = [...updatedMessages];

        if (evalData.result === 'correct') {
          const nextTopicId = currentTopicId + 1;
          // Check if we have more topics
          if (sessionInfo && nextTopicId < sessionInfo.topics.length) {
            const nextResponse = await geminiService.teachTopic(item.fullContent || '', user.uid, nextTopicId, "next");
            const nextData = nextResponse.data;
            setCurrentTopicId(nextTopicId);
            teacherMsg = {
              role: 'teacher',
              text: `${evalData.message}\n\nNext topic: ${nextData.title}\n\n${nextData.explanation}\n\nExample: ${nextData.example}\n\n${nextData.question}`,
              timestamp: new Date()
            };
          } else {
            teacherMsg = {
              role: 'teacher',
              text: `${evalData.message}\n\nGreat job! We've covered all the topics in this content. Would you like to take a quick quiz to test your knowledge?`,
              timestamp: new Date()
            };
          }
        } else if (evalData.result === 'ambiguous') {
          teacherMsg = {
            role: 'teacher',
            text: evalData.message,
            timestamp: new Date()
          };
        } else {
          teacherMsg = {
            role: 'teacher',
            text: `${evalData.message}\n\nHint: ${evalData.hint}`,
            timestamp: new Date()
          };
        }

        nextMessages.push(teacherMsg);
        setMessages(nextMessages);

        if (isVoiceMode) {
          speakLine(teacherMsg.text);
        }

        // Persist messages to Firestore
        if (sessionId) {
          await setDoc(doc(db, 'sessions', sessionId), {
            messages: nextMessages.map(m => ({
              role: m.role,
              text: m.text,
              timestamp: m.timestamp.toISOString()
            }))
          }, { merge: true });
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNextVoiceLine = async () => {
    setIsLoading(true);
    try {
      const lastLine = messages.length > 0 ? messages[messages.length - 1].text : undefined;
      const response = await geminiService.voiceTeach(item.fullContent || '', user.uid, currentTopicId, lastLine);
      const data = response.data;

      const teacherMsg: Message = {
        role: 'teacher',
        text: data.line,
        timestamp: new Date()
      };

      const nextMessages = [...messages, teacherMsg];
      setMessages(nextMessages);

      speakLine(data.line);

      // Persist messages to Firestore
      if (sessionId) {
        await setDoc(doc(db, 'sessions', sessionId), {
          messages: nextMessages.map(m => ({
            role: m.role,
            text: m.text,
            timestamp: m.timestamp.toISOString()
          }))
        }, { merge: true });
      }
    } catch (error) {
      console.error("Error in voice teach:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const speakLine = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.7;
      utterance.pitch = 1.0;
      
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleReplay = () => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'teacher') {
        speakLine(lastMsg.text);
      }
    }
  };

  const handleQuizAnswer = async (answer: string) => {
    const newAnswers = [...studentAnswers, answer];
    setStudentAnswers(newAnswers);

    if (currentQuizIndex < quizData.quiz.length - 1) {
      setCurrentQuizIndex(prev => prev + 1);
    } else {
      setIsLoading(true);
      try {
        const evalResponse = await geminiService.evaluateAnswers(quizData, newAnswers, user.uid);
        const evalResult = evalResponse.data;
        setEvaluation(evalResult);

        // Persist evaluation and progress
        if (sessionId) {
          await setDoc(doc(db, 'sessions', sessionId), {
            evaluation: evalResult
          }, { merge: true });

          // Update content progress if it's better
          if (evalResult.score > item.progress) {
            await setDoc(doc(db, 'content', item.id), {
              progress: evalResult.score
            }, { merge: true });
          }
        }
      } catch (error) {
        console.error("Error evaluating quiz:", error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-[calc(100vh-120px)] glass-card rounded-[2.5rem] overflow-hidden stitched-border stitched-x stitched-y shadow-2xl shadow-primary/5"
    >
      {/* Session Header */}
      <div className="px-10 py-6 bg-surface-container/60 backdrop-blur-md border-b border-outline-variant/15 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <button 
            onClick={onBack}
            className="p-3 rounded-2xl hover:bg-surface-container transition-all text-on-surface-variant hover:text-on-surface border border-transparent hover:border-outline-variant/20 group"
          >
            <ChevronLeft className="w-7 h-7 group-hover:-translate-x-1 transition-transform" />
          </button>
          <div>
            <h3 className="font-headline font-black text-2xl text-on-surface tracking-tight leading-none">{item.title}</h3>
            <div className="flex items-center space-x-3 mt-2">
              <div className="flex items-center space-x-1.5 bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-lg shadow-primary/40"></div>
                <span className="text-[10px] font-label font-black uppercase tracking-[0.2em] text-primary">Live Session</span>
              </div>
              <span className="text-[10px] font-label font-black uppercase tracking-[0.2em] text-on-surface-variant/50">ID: {item.id.slice(0, 8)}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-6">
          <button 
            onClick={() => setIsVoiceMode(!isVoiceMode)}
            className={`flex items-center space-x-3 px-6 py-3 rounded-2xl transition-all duration-500 shadow-lg ${
              isVoiceMode 
                ? 'bg-primary text-on-primary shadow-primary/30 scale-105' 
                : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface border border-outline-variant/15'
            }`}
          >
            <Zap className={`w-5 h-5 ${isVoiceMode ? 'fill-current animate-pulse' : ''}`} />
            <span className="text-xs font-black uppercase tracking-widest">Voice Mode</span>
          </button>

          {sessionInfo && (
            <div className="hidden lg:flex items-center space-x-8 pl-6 border-l border-outline-variant/20">
              <div className="text-right">
                <p className="text-[10px] font-label font-black uppercase tracking-widest text-on-surface-variant/60 mb-1">Difficulty</p>
                <p className="text-sm font-black text-on-surface capitalize tracking-tight">{sessionInfo.difficulty}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-label font-black uppercase tracking-widest text-on-surface-variant/60 mb-1">Key Concepts</p>
                <p className="text-sm font-black text-on-surface tracking-tight">{sessionInfo.topics.length} Topics</p>
              </div>
            </div>
          )}
        </div>
      </div>

    {/* Chat Area */}
      <div className="flex-1 overflow-y-auto px-10 py-8 space-y-8 scroll-smooth" ref={scrollRef}>
        {isVoiceMode && !isQuizzing && (
          <div className="flex flex-col items-center justify-center h-full space-y-16 text-center max-w-3xl mx-auto">
            <motion.div 
              key={messages.length}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="space-y-8"
            >
              <div className={`w-32 h-32 rounded-[2.5rem] bg-primary/10 flex items-center justify-center mx-auto border-2 border-primary/30 ${isSpeaking ? 'mentor-pulse' : ''} transition-all duration-700 shadow-2xl shadow-primary/10`}>
                <div className="relative">
                  <Sparkles className={`w-16 h-16 text-primary ${isSpeaking ? 'animate-pulse' : ''}`} />
                  {isSpeaking && (
                    <motion.div 
                      animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="absolute inset-0 bg-primary/20 rounded-full blur-xl"
                    />
                  )}
                </div>
              </div>
              <h2 className="text-4xl font-headline font-black text-on-surface leading-[1.1] min-h-[6rem] tracking-tight">
                {messages.length > 0 ? messages[messages.length - 1].text : "Ready to start your ethereal voice session?"}
              </h2>
            </motion.div>

            <div className="flex flex-col items-center space-y-8 w-full">
              <div className="flex items-center space-x-6">
                <button 
                  onClick={handleNextVoiceLine}
                  disabled={isLoading || isSpeaking}
                  className="hyper-gradient-btn px-16 py-6 rounded-3xl text-on-primary font-black text-xl shadow-[0_20px_50px_rgba(159,167,255,0.4)] hover:scale-105 active:scale-95 transition-all flex items-center space-x-5 disabled:opacity-50 disabled:scale-100 group"
                >
                  {isLoading ? (
                    <Loader2 className="w-7 h-7 animate-spin" />
                  ) : (
                    <>
                      <PlayCircle className="w-7 h-7 group-hover:rotate-12 transition-transform" />
                      <span className="uppercase tracking-widest">Next Line</span>
                    </>
                  )}
                </button>

                {messages.length > 0 && (
                  <button 
                    onClick={handleReplay}
                    disabled={isLoading || isSpeaking}
                    className="p-6 rounded-3xl bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all disabled:opacity-50 border border-outline-variant/15 shadow-xl"
                    title="Replay last line"
                  >
                    <Zap className="w-7 h-7" />
                  </button>
                )}
              </div>
              
              <div className="flex items-center space-x-3 bg-surface-container/40 px-6 py-2 rounded-full border border-outline-variant/10">
                <div className={`w-2.5 h-2.5 rounded-full ${isSpeaking ? 'bg-tertiary animate-ping shadow-lg shadow-tertiary/40' : 'bg-on-surface-variant/30'}`}></div>
                <p className="text-[10px] font-label font-black text-on-surface-variant/70 uppercase tracking-[0.4em]">
                  {isSpeaking ? 'Mentor is speaking...' : 'Waiting for next command'}
                </p>
              </div>
            </div>
          </div>
        )}

        {!isVoiceMode && !isQuizzing ? (
          <div className="max-w-4xl mx-auto space-y-8">
            {messages.map((msg, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex ${msg.role === 'teacher' ? 'justify-start' : 'justify-end'}`}
              >
                <div className={`max-w-[85%] flex items-start space-x-4 ${msg.role === 'teacher' ? '' : 'flex-row-reverse space-x-reverse'}`}>
                  <div className={`w-10 h-10 rounded-2xl flex-shrink-0 flex items-center justify-center shadow-lg ${
                    msg.role === 'teacher' ? 'bg-tertiary text-on-tertiary shadow-tertiary/20' : 'bg-primary text-on-primary shadow-primary/20'
                  }`}>
                    {msg.role === 'teacher' ? <Sparkles className="w-5 h-5" /> : <User className="w-5 h-5" />}
                  </div>
                  <div className={`rounded-3xl px-7 py-4 text-[15px] leading-relaxed shadow-sm ${
                    msg.role === 'teacher' 
                      ? 'bg-surface-container-high text-on-surface border border-outline-variant/15' 
                      : 'bg-primary/10 text-on-surface border border-primary/20'
                  }`}>
                    {msg.text}
                    <div className={`text-[10px] mt-2 font-label font-black uppercase tracking-widest opacity-40 ${msg.role === 'teacher' ? 'text-left' : 'text-right'}`}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-center space-x-3 bg-surface-container/40 px-6 py-3 rounded-2xl border border-outline-variant/10 text-on-surface-variant text-xs font-bold italic">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="uppercase tracking-widest opacity-70">Mentor is channeling insights...</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-3xl mx-auto py-12">
            {!evaluation ? (
              <motion.div 
                key={currentQuizIndex}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-10"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-label font-black uppercase tracking-[0.3em] text-primary">Knowledge Check</p>
                    <p className="text-[10px] font-label font-black uppercase tracking-[0.3em] text-on-surface-variant/50">Question {currentQuizIndex + 1} / {quizData.quiz.length}</p>
                  </div>
                  <div className="w-full h-1 bg-surface-container-highest rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${((currentQuizIndex + 1) / quizData.quiz.length) * 100}%` }}
                    />
                  </div>
                  <h4 className="text-3xl font-headline font-black text-on-surface leading-tight tracking-tight">{quizData.quiz[currentQuizIndex].question}</h4>
                </div>
                
                <div className="grid grid-cols-1 gap-5">
                  {quizData.quiz[currentQuizIndex].options.map((option: string, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => handleQuizAnswer(String.fromCharCode(65 + idx))}
                      className="w-full text-left px-8 py-6 rounded-3xl bg-surface-container-high border border-outline-variant/15 hover:border-primary/50 hover:bg-primary/5 transition-all group relative overflow-hidden"
                    >
                      <div className="flex items-center space-x-6 relative z-10">
                        <span className="w-12 h-12 rounded-2xl bg-surface-container-highest flex items-center justify-center text-lg font-black text-on-surface-variant group-hover:bg-primary group-hover:text-on-primary transition-all duration-500 shadow-inner">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span className="text-lg font-bold text-on-surface group-hover:text-primary transition-colors duration-500">{option}</span>
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-r from-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center space-y-12 py-8"
              >
                <div className="relative inline-block">
                  <div className="w-32 h-32 rounded-[2.5rem] bg-tertiary/10 flex items-center justify-center mx-auto border-2 border-tertiary/30 shadow-2xl shadow-tertiary/20">
                    <Award className="w-16 h-16 text-tertiary" />
                  </div>
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.5, type: 'spring' }}
                    className="absolute -top-4 -right-4 bg-primary text-on-primary w-12 h-12 rounded-full flex items-center justify-center font-black text-xl shadow-lg"
                  >
                    {evaluation.score}%
                  </motion.div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-5xl font-headline font-black text-on-surface tracking-tighter">Session Ascended</h4>
                  <p className="text-on-surface-variant text-lg max-w-md mx-auto leading-relaxed">
                    Your cognitive synchronization is complete. The mentor has evaluated your performance.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                  <div className="p-8 rounded-[2rem] bg-surface-container-high border border-outline-variant/15 shadow-xl stitched-border stitched-x">
                    <p className="text-[10px] font-label font-black uppercase tracking-[0.3em] text-on-surface-variant/60 mb-4">Focus Areas</p>
                    <div className="flex flex-wrap gap-3">
                      {evaluation.weak_topics.map((topic: string) => (
                        <span key={topic} className="px-4 py-2 rounded-xl bg-error/10 text-error text-[10px] font-black uppercase tracking-widest border border-error/20">{topic}</span>
                      ))}
                    </div>
                  </div>
                  <div className="p-8 rounded-[2rem] bg-surface-container-high border border-outline-variant/15 shadow-xl stitched-border stitched-y">
                    <p className="text-[10px] font-label font-black uppercase tracking-[0.3em] text-on-surface-variant/60 mb-4">Mentor's Guidance</p>
                    <p className="text-sm text-on-surface leading-relaxed italic opacity-80">"{evaluation.message}"</p>
                  </div>
                </div>

                <button 
                  onClick={onBack}
                  className="hyper-gradient-btn px-12 py-5 rounded-2xl text-on-primary font-black uppercase tracking-widest shadow-2xl shadow-primary/30 hover:scale-105 active:scale-95 transition-all"
                >
                  Return to Library
                </button>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* Input Area */}
      {!isQuizzing && (
        <div className="px-10 py-8 bg-surface-container/40 border-t border-outline-variant/15 backdrop-blur-md">
          <div className="relative flex items-center max-w-4xl mx-auto group">
            <div className="absolute left-6 text-on-surface-variant/50 group-focus-within:text-primary transition-colors">
              <MessageSquare className="w-5 h-5" />
            </div>
            <input 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              disabled={isLoading}
              className="w-full bg-surface-container-lowest border border-outline-variant/10 rounded-[2rem] py-5 pl-16 pr-20 text-[15px] focus:outline-none focus:border-primary/30 focus:ring-4 focus:ring-primary/5 transition-all placeholder:text-on-surface-variant/40 shadow-inner" 
              placeholder="Ask a question or type 'quiz' to test your knowledge..." 
              type="text"
            />
            <button 
              onClick={handleSendMessage}
              disabled={isLoading || !inputValue.trim()}
              className="absolute right-3 p-3.5 rounded-2xl bg-primary text-on-primary shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 group/btn"
            >
              <Send className="w-5 h-5 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
            </button>
          </div>
          <p className="text-[10px] text-on-surface-variant/40 mt-4 text-center uppercase tracking-[0.4em] font-black">
            The Lucid Intelligence Framework • Teaching Mode Active
          </p>
        </div>
      )}
    </motion.div>
  );
};

const MentorSuggestion = ({ onStudy }: { onStudy: (item: ContentItem) => void }) => {
  const suggestion: ContentItem = {
    id: 'suggested',
    title: 'Statistical Physics Foundations',
    description: 'Based on your recent focus on Quantum Mechanics, our AI suggests a supplementary module on Statistical Thermodynamics to bridge the knowledge gap.',
    type: 'notes',
    progress: 0,
    fullContent: `Statistical physics is a branch of physics that uses methods of probability theory and statistics, and particularly the mathematical tools for dealing with large populations and approximations, in solving physical problems. It can describe a wide variety of fields with an inherent stochastic nature.
    
    Statistical thermodynamics is the application of statistical mechanics to thermodynamics. It provides a molecular interpretation of thermodynamic quantities such as work, heat, free energy, and entropy.
    
    The Boltzmann distribution is a probability distribution or measure that gives the probability that a system will be in a certain state as a function of that state's energy and the temperature of the system.`
  };

  return (
    <section className="mt-24">
      <div className="flex items-center space-x-6 mb-10">
        <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-outline-variant/30"></div>
        <h5 className="text-[10px] font-label font-black uppercase tracking-[0.5em] text-on-surface-variant/50">Mentor Suggestions</h5>
        <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-outline-variant/30"></div>
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="relative overflow-hidden rounded-[2.5rem] bg-surface-container-low border border-outline-variant/15 p-12 flex flex-col lg:flex-row items-center gap-16 shadow-2xl stitched-border stitched-x"
      >
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none"></div>
        
        <div className="w-full lg:w-1/2 relative z-10 space-y-8">
          <div className="inline-flex items-center space-x-3 bg-secondary/10 px-5 py-2 rounded-full border border-secondary/20">
            <Zap className="text-secondary w-4 h-4 fill-current" />
            <span className="text-[10px] font-label font-black uppercase tracking-widest text-secondary">Accelerated Insight</span>
          </div>
          <h4 className="font-headline text-4xl font-black text-on-surface leading-tight tracking-tight">
            Deep Dive: Statistical Physics Foundations
          </h4>
          <p className="text-on-surface-variant text-lg leading-relaxed opacity-80">
            Based on your recent focus on Quantum Mechanics, our AI suggests a supplementary module on Statistical Thermodynamics to bridge the knowledge gap.
          </p>
          <button 
            onClick={() => onStudy(suggestion)}
            className="hyper-gradient-btn px-10 py-5 rounded-2xl text-on-primary font-black uppercase tracking-widest shadow-2xl shadow-primary/30 hover:scale-105 active:scale-95 transition-all"
          >
            Generate Module
          </button>
        </div>

        <div className="w-full lg:w-1/2 relative">
          <div className="aspect-video rounded-3xl overflow-hidden border border-outline-variant/30 shadow-2xl relative group stitched-border stitched-y">
            <img 
              alt="Statistical Physics Concept" 
              className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" 
              src="https://picsum.photos/seed/physics/800/450" 
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent flex items-end p-8">
              <div className="flex items-center space-x-5">
                <div className="w-14 h-14 rounded-2xl border-2 border-primary/40 p-1 bg-background/60 backdrop-blur-xl flex items-center justify-center shadow-xl">
                  <Sparkles className="text-primary w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-label font-black uppercase tracking-widest text-on-surface">Ready to explore</p>
                  <p className="text-[10px] text-on-surface-variant/60 font-medium">Estimated generation: 45 seconds</p>
                </div>
              </div>
            </div>
          </div>
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-tertiary/10 blur-[80px] rounded-full"></div>
        </div>
      </motion.div>
    </section>
  );
};

interface GeneralChatSession {
  id: string;
  userId: string;
  title: string;
  messages: {
    role: 'teacher' | 'student';
    text: string;
    timestamp: string;
  }[];
  createdAt: any;
  updatedAt: any;
}

const ChatBot = ({ isOpen, onClose, user }: { isOpen: boolean, onClose: () => void, user: FirebaseUser | null }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<GeneralChatSession[]>([]);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, view]);

  // Load chat history
  useEffect(() => {
    if (!user || !isOpen) return;

    const q = query(
      collection(db, 'general_chats'),
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const history = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as GeneralChatSession[];
      setChatHistory(history);
      
      // If no current chat and we have history, load the most recent one
      if (!currentChatId && history.length > 0 && view === 'chat' && messages.length === 0) {
        const latest = history[0];
        setCurrentChatId(latest.id);
        setMessages(latest.messages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        })));
      } else if (history.length === 0 && messages.length === 0) {
        // Initial welcome message for new users
        setMessages([
          { role: 'teacher', text: "Hello! I'm your AutoMentor AI. How can I help you with your studies today?", timestamp: new Date() }
        ]);
      }
    }, (error) => {
      console.error("Error fetching chat history:", error);
      handleFirestoreError(error, OperationType.GET, 'general_chats');
    });

    return () => unsubscribe();
  }, [user, isOpen, currentChatId]);

  const startNewChat = () => {
    setCurrentChatId(null);
    setMessages([
      { role: 'teacher', text: "Hello! I'm your AutoMentor AI. How can I help you with your studies today?", timestamp: new Date() }
    ]);
    setView('chat');
  };

  const selectChat = (chat: GeneralChatSession) => {
    setCurrentChatId(chat.id);
    setMessages(chat.messages.map((m: any) => ({
      ...m,
      timestamp: new Date(m.timestamp)
    })));
    setView('chat');
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading || !user) return;

    const studentMessage: Message = {
      role: 'student',
      text: inputValue,
      timestamp: new Date()
    };

    const updatedMessages = [...messages, studentMessage];
    setMessages(updatedMessages);
    setInputValue('');
    setIsLoading(true);

    try {
      const chatResponse = await geminiService.generalChat(inputValue, user.uid, messages);
      const teacherMessage: Message = {
        role: 'teacher',
        text: chatResponse.data.response,
        timestamp: new Date()
      };
      const finalMessages = [...updatedMessages, teacherMessage];
      setMessages(finalMessages);

      // Persist to Firestore
      if (currentChatId) {
        await setDoc(doc(db, 'general_chats', currentChatId), {
          messages: finalMessages.map(m => ({
            role: m.role,
            text: m.text,
            timestamp: m.timestamp.toISOString()
          })),
          updatedAt: serverTimestamp()
        }, { merge: true });
      } else {
        // Create new chat document
        const chatRef = doc(collection(db, 'general_chats'));
        const newChatId = chatRef.id;
        await setDoc(chatRef, {
          id: newChatId,
          userId: user.uid,
          title: inputValue.substring(0, 30) + (inputValue.length > 30 ? '...' : ''),
          messages: finalMessages.map(m => ({
            role: m.role,
            text: m.text,
            timestamp: m.timestamp.toISOString()
          })),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        setCurrentChatId(newChatId);
      }
    } catch (error) {
      console.error("Error in chatbot:", error);
      handleFirestoreError(error, OperationType.WRITE, 'general_chats');
      setMessages(prev => [...prev, {
        role: 'teacher',
        text: "I'm sorry, I encountered an error. Please try again.",
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className="fixed bottom-28 right-10 w-96 h-[550px] glass-card rounded-[2.5rem] border border-outline-variant/20 shadow-2xl z-[60] flex flex-col overflow-hidden stitched-border stitched-y"
        >
          <div className="px-6 py-5 bg-surface-container-highest/80 border-b border-outline-variant/15 flex items-center justify-between backdrop-blur-xl">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 rounded-2xl bg-tertiary flex items-center justify-center shadow-lg shadow-tertiary/20">
                <Sparkles className="text-on-tertiary w-5 h-5" />
              </div>
              <div>
                <h4 className="font-headline font-black text-[13px] text-on-surface uppercase tracking-tight">AutoMentor AI</h4>
                <p className="text-[9px] text-tertiary font-black uppercase tracking-[0.3em]">
                  {view === 'chat' ? 'Neural Link Active' : 'Memory Vault'}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button 
                onClick={() => setView(view === 'chat' ? 'history' : 'chat')}
                className="p-2.5 rounded-xl hover:bg-surface-container-high transition-all text-on-surface-variant/60 hover:text-primary border border-transparent hover:border-primary/20"
                title={view === 'chat' ? 'View History' : 'Back to Chat'}
              >
                {view === 'chat' ? <BookOpen className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
              </button>
              <button onClick={onClose} className="p-2.5 rounded-xl hover:bg-surface-container-high transition-all text-on-surface-variant/60 hover:text-error border border-transparent hover:border-error/20">
                <ChevronLeft className="w-5 h-5 rotate-180" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6" ref={scrollRef}>
            {view === 'chat' ? (
              <div className="space-y-4">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'teacher' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                      msg.role === 'teacher' 
                        ? 'bg-surface-container-high text-on-surface border border-outline-variant/10' 
                        : 'bg-primary text-on-primary'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex items-center space-x-2 text-slate-500 text-xs italic">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Mentor is typing...</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <button 
                  onClick={startNewChat}
                  className="w-full p-4 rounded-xl border border-dashed border-outline-variant/30 flex items-center justify-center space-x-2 hover:border-primary/50 hover:bg-primary/5 transition-all group"
                >
                  <PlusCircle className="w-4 h-4 text-slate-500 group-hover:text-primary" />
                  <span className="text-xs font-bold text-slate-400 group-hover:text-on-surface">Start New Conversation</span>
                </button>
                
                {chatHistory.length === 0 ? (
                  <div className="py-10 text-center text-slate-500 text-xs">
                    No past conversations found.
                  </div>
                ) : (
                  chatHistory.map((chat) => (
                    <button
                      key={chat.id}
                      onClick={() => selectChat(chat)}
                      className={`w-full p-4 rounded-xl border text-left transition-all ${
                        currentChatId === chat.id 
                          ? 'bg-primary/10 border-primary/30' 
                          : 'bg-surface-container-low border-outline-variant/10 hover:border-primary/20'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <h5 className="text-xs font-bold text-on-surface truncate pr-2">{chat.title || 'Untitled Chat'}</h5>
                        <span className="text-[9px] text-slate-500 whitespace-nowrap">
                          {chat.updatedAt?.toDate ? chat.updatedAt.toDate().toLocaleDateString() : 'Recent'}
                        </span>
                      </div>
                      <p className="text-[10px] text-on-surface-variant line-clamp-1 opacity-70">
                        {chat.messages[chat.messages.length - 1]?.text || 'No messages'}
                      </p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {view === 'chat' && (
            <div className="p-4 bg-slate-900/40 border-t border-slate-700/30">
              <div className="relative flex items-center">
                <input 
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  disabled={isLoading}
                  className="w-full bg-surface-container-lowest/50 border-none rounded-xl py-3 pl-4 pr-12 text-sm focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-slate-600" 
                  placeholder="Ask anything..." 
                  type="text"
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={isLoading || !inputValue.trim()}
                  className="absolute right-2 p-2 rounded-lg bg-primary text-on-primary hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const UploadModal = ({ isOpen, onClose, user }: { isOpen: boolean, onClose: () => void, user: FirebaseUser | null }) => {
  const [files, setFiles] = useState<{ file: File, title: string, description: string, type: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [successSummary, setSuccessSummary] = useState<string[] | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSuccessSummary(null);
      setFiles([]);
    }
  }, [isOpen]);

  const processFiles = (selectedFiles: FileList | File[]) => {
    setSuccessSummary(null);
    const newFiles = Array.from(selectedFiles).map(file => ({
      file,
      title: file.name.split('.')[0],
      description: '',
      type: file.type.includes('pdf') ? 'pdf' : file.type.includes('video') ? 'video' : 'notes'
    }));
    setFiles(prev => [...prev, ...newFiles]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const updateFileData = (index: number, data: Partial<{ title: string, description: string, type: string }>) => {
    setFiles(prev => prev.map((f, i) => i === index ? { ...f, ...data } : f));
  };

  const handleUpload = async () => {
    if (!user || files.length === 0) return;
    setIsUploading(true);
    const uploadedTitles = files.map(f => f.title);

    try {
      for (const item of files) {
        const contentRef = doc(collection(db, 'content'));
        const contentId = contentRef.id;
        
        // In a real app, we would upload the file to storage and get a URL
        // For this demo, we'll simulate text extraction or just use a placeholder
        const reader = new FileReader();
        const contentText = await new Promise<string>((resolve) => {
          reader.onload = (e) => resolve(e.target?.result as string || "No content extracted.");
          reader.readAsText(item.file.slice(0, 5000)); // Read first 5KB as a sample
        });

        await setDoc(contentRef, {
          id: contentId,
          userId: user.uid,
          title: item.title,
          description: item.description || `Uploaded ${item.file.name}`,
          type: item.type,
          progress: 0,
          fullContent: contentText,
          createdAt: serverTimestamp()
        });
      }
      setFiles([]);
      setSuccessSummary(uploadedTitles);
    } catch (error) {
      console.error("Error uploading files:", error);
      handleFirestoreError(error, OperationType.WRITE, 'content');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-2xl glass-card rounded-3xl border border-outline-variant/20 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="px-8 py-6 border-b border-slate-700/30 flex items-center justify-between bg-slate-900/50">
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${successSummary ? 'bg-tertiary/20' : 'bg-primary/20'}`}>
                  {successSummary ? <CheckCircle2 className="text-tertiary w-5 h-5" /> : <CloudUpload className="text-primary w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-xl font-headline font-bold text-on-surface">
                    {successSummary ? 'Upload Complete' : 'Bulk Upload Resources'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {successSummary ? 'Your library has been updated' : 'Add multiple learning materials to your library'}
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-800 transition-colors text-slate-500">
                <ChevronLeft className="w-6 h-6 rotate-180" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              {successSummary ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-12 text-center space-y-8"
                >
                  <div className="w-20 h-20 rounded-full bg-tertiary/20 flex items-center justify-center border-2 border-tertiary">
                    <CheckCircle2 className="w-10 h-10 text-tertiary" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-3xl font-headline font-black text-on-surface">Upload Successful!</h3>
                    <p className="text-on-surface-variant">Successfully added {successSummary.length} resources to your library.</p>
                  </div>
                  <div className="w-full max-w-sm bg-surface-container-high rounded-2xl p-6 border border-outline-variant/10 text-left">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">Uploaded Files</p>
                    <ul className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                      {successSummary.map((title, i) => (
                        <li key={i} className="text-sm text-on-surface flex items-center space-x-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                          <span className="truncate font-medium">{title}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button 
                    onClick={() => {
                      setSuccessSummary(null);
                      onClose();
                    }}
                    className="hyper-gradient-btn px-12 py-4 rounded-xl text-on-primary font-bold shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all w-full max-w-sm"
                  >
                    Done
                  </button>
                </motion.div>
              ) : files.length === 0 ? (
                <label 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-2xl transition-all cursor-pointer group ${
                    isDragging 
                      ? 'border-primary bg-primary/10 scale-[1.02]' 
                      : 'border-outline-variant/30 hover:border-primary/50 hover:bg-primary/5'
                  }`}
                >
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-transform ${
                    isDragging ? 'bg-primary/20 scale-110' : 'bg-surface-container-high group-hover:scale-110'
                  }`}>
                    <PlusSquare className={`w-8 h-8 ${isDragging ? 'text-primary' : 'text-slate-500 group-hover:text-primary'}`} />
                  </div>
                  <p className={`font-headline font-bold transition-colors ${isDragging ? 'text-primary' : 'text-slate-400 group-hover:text-on-surface'}`}>
                    {isDragging ? 'Drop Files Here' : 'Select Files to Upload'}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">Drag & drop or click to browse</p>
                  <input type="file" multiple onChange={handleFileChange} className="hidden" accept=".pdf,.txt,.doc,.docx,.ppt,.pptx" />
                </label>
              ) : (
                <div className="space-y-4">
                  {files.map((item, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="p-4 rounded-2xl bg-surface-container-high border border-outline-variant/10 space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                            {item.type === 'pdf' ? <FileText className="w-4 h-4 text-error" /> : <FileCode className="w-4 h-4 text-primary" />}
                          </div>
                          <span className="text-sm font-bold text-on-surface truncate max-w-[200px]">{item.file.name}</span>
                        </div>
                        <button onClick={() => removeFile(idx)} className="p-1.5 rounded-lg hover:bg-error/10 text-slate-500 hover:text-error transition-colors">
                          <PlusCircle className="w-4 h-4 rotate-45" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Title</label>
                          <input 
                            value={item.title}
                            onChange={(e) => updateFileData(idx, { title: e.target.value })}
                            className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-primary/40 outline-none"
                            placeholder="Enter title..."
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Type</label>
                          <select 
                            value={item.type}
                            onChange={(e) => updateFileData(idx, { type: e.target.value })}
                            className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-primary/40 outline-none appearance-none"
                          >
                            <option value="pdf">PDF Document</option>
                            <option value="notes">Study Notes</option>
                            <option value="video">Video Lecture</option>
                            <option value="practice">Practice Material</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">Description</label>
                        <textarea 
                          value={item.description}
                          onChange={(e) => updateFileData(idx, { description: e.target.value })}
                          className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-primary/40 outline-none min-h-[60px] resize-none"
                          placeholder="What is this about?"
                        />
                      </div>
                    </motion.div>
                  ))}
                  
                  <button 
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.multiple = true;
                      input.onchange = (e: any) => handleFileChange(e);
                      input.click();
                    }}
                    className="w-full py-3 rounded-xl border border-dashed border-outline-variant/30 flex items-center justify-center space-x-2 text-slate-500 hover:text-primary hover:border-primary/50 transition-all"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span className="text-xs font-bold">Add More Files</span>
                  </button>
                </div>
              )}
            </div>

            {!successSummary && (
              <div className="p-8 bg-slate-900/60 border-t border-slate-700/30 flex items-center justify-between">
                <div className="text-xs text-slate-500">
                  {files.length} file{files.length !== 1 ? 's' : ''} selected
                </div>
                <div className="flex items-center space-x-4">
                  <button 
                    onClick={onClose}
                    className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:text-on-surface transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    disabled={files.length === 0 || isUploading}
                    onClick={handleUpload}
                    className="px-8 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all flex items-center space-x-2"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <CloudUpload className="w-4 h-4" />
                        <span>Upload All</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const ProfileView: React.FC<{ profile: UserProfile, onUpdate: (data: Partial<UserProfile>) => Promise<void> }> = ({ profile, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    displayName: profile.displayName || '',
    bio: profile.bio || '',
    photoURL: profile.photoURL || ''
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate(formData);
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating profile:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto"
    >
      <div className="glass-card rounded-[2.5rem] border border-outline-variant/15 overflow-hidden stitched-border stitched-x">
        {/* Profile Header/Cover */}
        <div className="h-48 bg-gradient-to-r from-primary/20 via-secondary/20 to-tertiary/20 relative">
          <div className="absolute -bottom-16 left-12 flex items-end space-x-6">
            <div className="relative group">
              <div className="w-32 h-32 rounded-3xl overflow-hidden border-4 border-surface shadow-2xl bg-surface-container">
                <img 
                  src={formData.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.email}`} 
                  alt="Profile" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              {isEditing && (
                <button className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl">
                  <Camera className="text-white w-8 h-8" />
                </button>
              )}
            </div>
            <div className="mb-4">
              <h2 className="text-3xl font-headline font-black text-on-surface tracking-tight">
                {profile.displayName || 'Learner'}
              </h2>
              <p className="text-primary font-label font-bold uppercase tracking-widest text-xs opacity-70">
                {profile.role === 'admin' ? 'System Architect' : 'Knowledge Seeker'}
              </p>
            </div>
          </div>
          <div className="absolute bottom-4 right-8">
            {!isEditing ? (
              <button 
                onClick={() => setIsEditing(true)}
                className="px-6 py-2.5 rounded-xl bg-surface/80 backdrop-blur-md border border-outline-variant/20 text-on-surface font-bold text-sm hover:bg-surface transition-all flex items-center space-x-2"
              >
                <Settings className="w-4 h-4" />
                <span>Edit Profile</span>
              </button>
            ) : (
              <div className="flex items-center space-x-3">
                <button 
                  onClick={() => setIsEditing(false)}
                  className="px-6 py-2.5 rounded-xl bg-surface/80 backdrop-blur-md border border-outline-variant/20 text-on-surface-variant font-bold text-sm hover:bg-surface transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-8 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center space-x-2"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Save Changes</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="pt-24 px-12 pb-12 grid grid-cols-1 md:grid-cols-3 gap-12">
          {/* Left Column: Info */}
          <div className="md:col-span-2 space-y-8">
            <section className="space-y-4">
              <h3 className="text-lg font-headline font-bold text-on-surface flex items-center space-x-2">
                <BookOpen className="w-5 h-5 text-primary" />
                <span>Biography</span>
              </h3>
              {isEditing ? (
                <textarea 
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  className="w-full bg-surface-container border border-outline-variant/20 rounded-2xl p-4 text-on-surface placeholder:text-on-surface-variant/40 focus:ring-2 focus:ring-primary/20 outline-none min-h-[120px] resize-none"
                  placeholder="Tell the mentor about your learning goals..."
                />
              ) : (
                <p className="text-on-surface-variant leading-relaxed opacity-80">
                  {profile.bio || "No biography provided yet. Tell us about your journey!"}
                </p>
              )}
            </section>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="p-6 rounded-3xl bg-surface-container-low border border-outline-variant/10">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Email Address</p>
                <p className="text-on-surface font-medium">{profile.email}</p>
              </div>
              <div className="p-6 rounded-3xl bg-surface-container-low border border-outline-variant/10">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Member Since</p>
                <p className="text-on-surface font-medium">
                  {profile.joinedAt?.toDate ? profile.joinedAt.toDate().toLocaleDateString() : 'Recent'}
                </p>
              </div>
            </div>

            {isEditing && (
              <div className="space-y-4 pt-4 border-t border-outline-variant/10">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 ml-1">Display Name</label>
                  <input 
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    className="w-full bg-surface-container border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 outline-none"
                    placeholder="Your public name"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 ml-1">Avatar URL</label>
                  <input 
                    value={formData.photoURL}
                    onChange={(e) => setFormData({ ...formData, photoURL: e.target.value })}
                    className="w-full bg-surface-container border border-outline-variant/20 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 outline-none"
                    placeholder="https://..."
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Stats */}
          <div className="space-y-6">
            <div className="p-8 rounded-[2rem] bg-primary/5 border border-primary/10 relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
              <div className="relative z-10">
                <Zap className="w-8 h-8 text-primary mb-4" />
                <p className="text-3xl font-headline font-black text-on-surface">85%</p>
                <p className="text-xs text-primary font-bold uppercase tracking-widest mt-1">Focus Mastery</p>
              </div>
            </div>

            <div className="p-8 rounded-[2rem] bg-secondary/5 border border-secondary/10 relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-secondary/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
              <div className="relative z-10">
                <Award className="w-8 h-8 text-secondary mb-4" />
                <p className="text-3xl font-headline font-black text-on-surface">12</p>
                <p className="text-xs text-secondary font-bold uppercase tracking-widest mt-1">Sessions Completed</p>
              </div>
            </div>

            <div className="p-8 rounded-[2rem] bg-tertiary/5 border border-tertiary/10 relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-tertiary/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
              <div className="relative z-10">
                <Sparkles className="w-8 h-8 text-tertiary mb-4" />
                <p className="text-3xl font-headline font-black text-on-surface">Gold</p>
                <p className="text-xs text-tertiary font-bold uppercase tracking-widest mt-1">Mentor Affinity</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeNav, setActiveNav] = useState('Dashboard');
  const [activeFilter, setActiveFilter] = useState('All');
  const [activeSession, setActiveSession] = useState<ContentItem | null>(null);
  const [userContent, setUserContent] = useState<ContentItem[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  
  const filters = ['All', 'PDFs', 'Notes', 'Video'];

  useEffect(() => {
    let profileUnsubscribe: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
      
      if (firebaseUser) {
        // Sync user profile to Firestore
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        // Listen for profile changes
        profileUnsubscribe = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            // Create initial profile if it doesn't exist
            const initialProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || 'Learner',
              photoURL: firebaseUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${firebaseUser.email}`,
              role: 'user',
              joinedAt: serverTimestamp()
            };
            setDoc(userRef, initialProfile);
          }
        }, (error) => {
          console.error("Error listening to profile:", error);
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        });
      } else {
        setProfile(null);
        if (profileUnsubscribe) profileUnsubscribe();
      }
    });

    return () => {
      unsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setUserContent([]);
      return;
    }

    setContentLoading(true);
    const q = query(
      collection(db, 'content'), 
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as ContentItem[];
      
      // If no items, seed with mock data for the demo
      if (items.length === 0) {
        seedMockData(user.uid);
      } else {
        setUserContent(items);
      }
      setContentLoading(false);
    }, (error) => {
      console.error("Error fetching content:", error);
      handleFirestoreError(error, OperationType.LIST, 'content');
      setContentLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const seedMockData = async (userId: string) => {
    try {
      for (const item of MOCK_CONTENT) {
        const { id, ...rest } = item;
        const docId = `${userId}_${id}`;
        await setDoc(doc(db, 'content', docId), {
          id: docId,
          ...rest,
          userId,
          createdAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error("Error seeding mock data:", error);
    }
  };

  const handleUpdateProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, data, { merge: true });
    } catch (error) {
      console.error("Error updating profile:", error);
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const filteredContent = userContent.filter(item => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'PDFs') return item.type === 'pdf';
    if (activeFilter === 'Notes') return item.type === 'notes';
    if (activeFilter === 'Video') return item.type === 'video';
    return true;
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <p className="text-slate-500 font-label uppercase tracking-widest text-xs">Initializing AutoMentor AI...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#091328] flex items-center justify-center relative overflow-hidden">
        {/* Stitched Grid Background */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.05] z-0" 
             style={{ 
               backgroundImage: `linear-gradient(to right, var(--stitch-line) 1px, transparent 1px), linear-gradient(to bottom, var(--stitch-line) 1px, transparent 1px)`,
               backgroundSize: '60px 60px'
             }}>
        </div>

        <div className="absolute top-[-10%] right-[-10%] w-[800px] h-[800px] bg-primary/10 blur-[150px] rounded-full"></div>
        <div className="absolute bottom-[-5%] left-[-5%] w-[600px] h-[600px] bg-secondary/10 blur-[120px] rounded-full"></div>
        
        <motion.div 
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="glass-card p-16 rounded-[3rem] border border-outline-variant/15 text-center max-w-lg w-full relative z-10 shadow-[0_50px_100px_rgba(0,0,0,0.5)] stitched-border stitched-x"
        >
          <div className="w-24 h-24 rounded-[2rem] bg-tertiary mentor-pulse flex items-center justify-center mx-auto mb-10 shadow-2xl shadow-tertiary/40">
            <Sparkles className="text-on-tertiary-fixed w-12 h-12" />
          </div>
          <h1 className="text-5xl font-headline font-black text-[#9fa7ff] mb-6 tracking-tighter">AutoMentor AI</h1>
          <p className="text-on-surface-variant text-lg mb-12 leading-relaxed opacity-80">
            Welcome to the future of learning. Sign in to access your personalized AI mentor and ethereal library.
          </p>
          <button 
            onClick={() => signInWithGoogle()}
            className="w-full hyper-gradient-btn py-6 rounded-2xl text-on-primary font-black text-xl flex items-center justify-center space-x-4 shadow-2xl shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all group"
          >
            <LogIn className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
            <span className="uppercase tracking-widest">Sign in with Google</span>
          </button>
          <div className="mt-12 pt-8 border-t border-outline-variant/10">
            <p className="text-[10px] text-on-surface-variant/40 uppercase tracking-[0.5em] font-black">The Lucid Intelligence Framework</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-on-background selection:bg-primary/30">
      <Sidebar 
        activeNav={activeNav} 
        onNavClick={setActiveNav} 
        onUploadClick={() => setIsUploadModalOpen(true)}
      />
      
      <main className="ml-64 flex-1 flex flex-col relative overflow-hidden">
        {/* Stitched Grid Background */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-0" 
             style={{ 
               backgroundImage: `linear-gradient(to right, var(--stitch-line) 1px, transparent 1px), linear-gradient(to bottom, var(--stitch-line) 1px, transparent 1px)`,
               backgroundSize: '40px 40px'
             }}>
        </div>

        {/* Ethereal Background Blobs */}
        <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-primary/5 blur-[120px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-[-5%] left-[-5%] w-[400px] h-[400px] bg-secondary/5 blur-[100px] rounded-full pointer-events-none"></div>

        <Header user={user} profile={profile} />

        <div className="pt-24 px-12 pb-16">
          <AnimatePresence mode="wait">
            {activeNav === 'Profile' && profile ? (
              <ProfileView key="profile" profile={profile} onUpdate={handleUpdateProfile} />
            ) : !activeSession ? (
              <motion.div 
                key="library"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {/* Filter Bar */}
                <section className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <h3 className="font-headline text-3xl font-extrabold text-on-surface tracking-tight mb-2">My Content</h3>
                    <p className="text-on-surface-variant max-w-lg">
                      Manage and explore your personalized learning artifacts generated by AutoMentor AI.
                    </p>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <div className="flex bg-surface-container-high rounded-full p-1 border border-outline-variant/15">
                      {filters.map((filter) => (
                        <button 
                          key={filter}
                          onClick={() => setActiveFilter(filter)}
                          className={`px-6 py-2 rounded-full text-xs font-label font-semibold uppercase tracking-widest transition-all duration-300 ${
                            activeFilter === filter 
                              ? 'bg-primary text-on-primary shadow-md' 
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {filter}
                        </button>
                      ))}
                    </div>
                    <button className="p-3 rounded-xl bg-surface-container-high border border-outline-variant/15 text-slate-400 hover:text-primary transition-colors">
                      <SlidersHorizontal className="w-5 h-5" />
                    </button>
                  </div>
                </section>

                {/* Grid */}
                {contentLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  </div>
                ) : (
                  <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    <AnimatePresence mode="popLayout">
                      {filteredContent.map((item) => (
                        <ContentCard key={item.id} item={item} onStudy={setActiveSession} />
                      ))}
                    </AnimatePresence>

                    {/* Add New Placeholder */}
                    <motion.div 
                      whileHover={{ scale: 1.02 }}
                      onClick={() => setIsUploadModalOpen(true)}
                      className="rounded-xl border-2 border-dashed border-outline-variant/30 flex flex-col items-center justify-center p-12 hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group"
                    >
                      <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <PlusSquare className="w-8 h-8 text-slate-500 group-hover:text-primary" />
                      </div>
                      <p className="font-headline font-bold text-slate-400 group-hover:text-on-surface">Upload New Resource</p>
                      <p className="text-xs text-slate-500 mt-2 text-center">PDF, PPT, or Image formats supported</p>
                    </motion.div>
                  </section>
                )}

                <MentorSuggestion onStudy={setActiveSession} />
              </motion.div>
            ) : (
              <StudySession 
                key="session"
                item={activeSession} 
                onBack={() => setActiveSession(null)} 
                user={user}
              />
            )}
          </AnimatePresence>
        </div>

        <UploadModal 
          isOpen={isUploadModalOpen} 
          onClose={() => setIsUploadModalOpen(false)} 
          user={user} 
        />

        {/* Footer */}
        <footer className="w-full py-12 mt-auto bg-surface-container-lowest/80 border-t border-outline-variant/10 flex flex-col items-center justify-center space-y-6 backdrop-blur-md">
          <div className="flex space-x-12">
            {['Documentation', 'Support', 'Terms of Service'].map((link) => (
              <a 
                key={link}
                className="font-label text-[10px] uppercase tracking-[0.3em] text-on-surface-variant/40 hover:text-primary transition-all font-black" 
                href="#"
              >
                {link}
              </a>
            ))}
          </div>
          <div className="flex flex-col items-center space-y-2">
            <div className="w-12 h-[1px] bg-gradient-to-r from-transparent via-outline-variant/30 to-transparent"></div>
            <p className="font-label text-[9px] uppercase tracking-[0.4em] text-on-surface-variant/30 font-medium">
              © 2026 AutoMentor AI. Powered by The Lucid Intelligence Framework.
            </p>
          </div>
        </footer>
      </main>

      {/* FAB */}
      <motion.button 
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsChatOpen(!isChatOpen)}
        className="fixed bottom-10 right-10 w-16 h-16 rounded-full hyper-gradient-btn shadow-2xl shadow-primary/30 flex items-center justify-center z-50 group"
      >
        <MessageSquare className="text-on-primary w-8 h-8 fill-current" />
        <span className="absolute right-20 bg-surface-container-high text-on-surface px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-outline-variant/30">
          Ask the Mentor
        </span>
      </motion.button>

      <ChatBot isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} user={user} />
      <FocusMonitor />
    </div>
  );
}
