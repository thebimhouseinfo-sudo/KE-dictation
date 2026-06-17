import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  Pause, 
  RefreshCw, 
  BookOpen, 
  Volume2, 
  CheckCircle2, 
  Send, 
  SkipForward, 
  ChevronLeft,
  EyeOff,
  Info,
  Home,
  Settings
} from 'lucide-react';

// --- Types ---

interface Question {
  question: string;
  options?: string[];
  answer: number | string;
}

interface PassageSentence {
  text: string;
  audioClear?: string;
  audioWithPunc?: string;
}

interface PassageData {
  id: string;
  title: string;
  content: string;
  sentences?: PassageSentence[];
  questions: Question[];
}

interface DictationSegment {
  text: string;
  originalText: string;
  pauseTime: number; // in seconds
  audioClear?: string;
  audioWithPunc?: string;
}

export default function App() {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [passage, setPassage] = useState<PassageData | null>(null);
  const [mode, setMode] = useState<'reading' | 'dictation' | 'questions'>('reading');
  
  // Dictation state
  const [isDictating, setIsDictating] = useState(false);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [repeatCount, setRepeatCount] = useState(0);
  const [segments, setSegments] = useState<DictationSegment[]>([]);
  const [countdown, setCountdown] = useState(0);
  
  // Question state
  const [userAnswers, setUserAnswers] = useState<(number | null)[]>([]);
  const [showResults, setShowResults] = useState(false);

  // Settings state for pause time multiplier
  const [pauseTimeMultiplier, setPauseTimeMultiplier] = useState<number>(() => {
    const saved = localStorage.getItem('dictation_pause_multiplier');
    return saved ? parseFloat(saved) : 1;
  });
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    localStorage.setItem('dictation_pause_multiplier', String(pauseTimeMultiplier));
  }, [pauseTimeMultiplier]);

  // Audio/TTS Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Lessons data & local stats
  const [lessons, setLessons] = useState<PassageData[]>([]);
  const [dictationVoiceType, setDictationVoiceType] = useState<'clear' | 'withPunc'>('withPunc');
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);
  const [randomHistory, setRandomHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('random_lessons_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const selectRandomLesson = () => {
    if (lessons.length === 0) return;
    
    // Make sure we do not repeat any lesson that appeared in the last 3 random selections
    let exclusions = randomHistory;
    let pool = lessons.filter(ls => !exclusions.includes(ls.id));
    
    if (pool.length === 0) {
      // If pool is empty (e.g. fewer than 4 total lessons in lessons list), shrink exclusions list
      for (let i = 1; i <= exclusions.length; i++) {
        const lesserExclusions = exclusions.slice(i);
        pool = lessons.filter(ls => !lesserExclusions.includes(ls.id));
        if (pool.length > 0) break;
      }
    }
    if (pool.length === 0) {
      pool = lessons;
    }
    
    const randomIndex = Math.floor(Math.random() * pool.length);
    const chosen = pool[randomIndex];
    
    const newHistory = [...randomHistory, chosen.id].slice(-3);
    setRandomHistory(newHistory);
    try {
      localStorage.setItem('random_lessons_history', JSON.stringify(newHistory));
    } catch (e) {
      console.error(e);
    }
    
    startLesson(chosen);
  };

  // Load lessons on mount
  useEffect(() => {
    const fetchLessons = async () => {
      try {
        const res = await fetch('lessons.json');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setLessons(data);
          } else if (typeof data === 'object' && data !== null) {
            // Group raw segment objects by their article field
            const grouped: Record<string, {
              title: string;
              sentencesMap: Record<string, { textText: string; plainFile?: string; punctFile?: string }>;
              questions: any[];
            }> = {};

            Object.entries(data).forEach(([key, val]: [string, any]) => {
              const articleTitle = val.article || "Không tên";
              if (!grouped[articleTitle]) {
                grouped[articleTitle] = {
                  title: articleTitle,
                  sentencesMap: {},
                  questions: []
                };
              }

              const item = grouped[articleTitle];
              
              let sentenceId = key;
              if (key.endsWith('_plain')) {
                sentenceId = key.substring(0, key.length - 6);
              } else if (key.endsWith('_punct')) {
                sentenceId = key.substring(0, key.length - 6);
              }

              if (!item.sentencesMap[sentenceId]) {
                item.sentencesMap[sentenceId] = { textText: val.text };
              }

              if (val.type === 'plain') {
                item.sentencesMap[sentenceId].plainFile = val.file;
              } else if (val.type === 'punctuation') {
                item.sentencesMap[sentenceId].punctFile = val.file;
              }

              if (Array.isArray(val.questions) && val.questions.length > 0) {
                val.questions.forEach((q: any) => {
                  if (!item.questions.some(existingQ => existingQ.question === q.question)) {
                    item.questions.push(q);
                  }
                });
              }
            });

            const mappedLessons = Object.entries(grouped).map(([title, item], idx) => {
              const sortedSentenceKeys = Object.keys(item.sentencesMap).sort();
              const sentences = sortedSentenceKeys.map(k => {
                const s = item.sentencesMap[k];
                return {
                  text: s.textText,
                  audioClear: s.plainFile ? `audio/${s.plainFile}` : undefined,
                  audioWithPunc: s.punctFile ? `audio/${s.punctFile}` : undefined
                };
              });

              const fullContent = sentences.map(s => s.text).join(" ");

              return {
                id: `lesson-${idx + 1}`,
                title: title,
                content: fullContent,
                sentences: sentences,
                questions: item.questions
              };
            });

            setLessons(mappedLessons);
          } else {
            setLessons([]);
          }
        }
      } catch (err) {
        console.error("Failed to load lessons.json:", err);
      }
    };
    fetchLessons();

    try {
      const saved = localStorage.getItem('completed_lessons');
      if (saved) {
        setCompletedLessons(JSON.parse(saved));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Completion indicator logic
  const markLessonAsCompleted = (id: string) => {
    if (!id || completedLessons.includes(id)) return;
    const updated = [...completedLessons, id];
    setCompletedLessons(updated);
    try {
      localStorage.setItem('completed_lessons', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (showResults && passage && passage.id) {
      markLessonAsCompleted(passage.id);
    }
  }, [showResults, passage]);

  const startLesson = (selectedPassage: PassageData) => {
    unlockAudio();
    setPassage(selectedPassage);
    setMode('reading');
    setUserAnswers(selectedPassage.questions.map(() => null));
    setShowResults(false);
  };

  // --- Dictation Logic ---

  const splitIntoSegments = (text: string | undefined): DictationSegment[] => {
    if (!text) return [];
    const rawSegments = text.split(/([.,;:!?\n]|\s-\s)/g).filter(s => s && s.trim().length > 0);
    const processed: DictationSegment[] = [];
    let i = 0;
    
    while (i < rawSegments.length) {
      let current = rawSegments[i] || '';
      let nextPunc = (i + 1 < rawSegments.length && /^[.,;:!?\n\s-]+$/.test(rawSegments[i+1] || '')) ? rawSegments[i+1] || '' : '';
      let fullSegment = current + nextPunc;
      let wordCount = current.split(/\s+/).filter(w => w.length > 0).length;
      
      if (wordCount < 5 && i + 2 < rawSegments.length) {
        let secondPart = rawSegments[i+2] || '';
        let secondPunc = (i + 3 < rawSegments.length && /^[.,;:!?\n\s-]+$/.test(rawSegments[i+3] || '')) ? rawSegments[i+3] || '' : '';
        let secondWordCount = secondPart.split(/\s+/).filter(w => w.length > 0).length;
        if (wordCount + secondWordCount <= 12) {
          fullSegment += ' ' + secondPart + secondPunc;
          wordCount += secondWordCount;
          i += 2;
        }
      }
      
      const puncMap: Record<string, string> = {
        '.': 'dấu chấm',
        ',': 'dấu phẩy',
        ';': 'dấu chấm phẩy',
        ':': 'dấu hai chấm',
        '!': 'dấu chấm cảm',
        '?': 'dấu chấm hỏi',
        '-': 'dấu gạch ngang',
        '\n': 'xuống dòng'
      };

      let ttsText = fullSegment;
      Object.entries(puncMap).forEach(([symbol, name]) => {
        const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Xóa ký tự gốc và thay bằng "dấu ..." để đọc tự nhiên
        ttsText = ttsText.replace(new RegExp(escapedSymbol, 'g'), ` ${name} `);
      });
      ttsText = ttsText.replace(/\s+/g, ' ').trim();

      processed.push({
        originalText: fullSegment,
        text: ttsText,
        pauseTime: Math.round((wordCount < 6 ? 6 : 10) * pauseTimeMultiplier)
      });
      i += 2;
    }
    return processed;
  };

  const getProcessedText = (text: string | undefined, slow: boolean) => {
    if (!text || typeof text !== 'string') return '';
    // Lượt đọc cuối sẽ không còn ngắt từng chữ bằng dấu phẩy
    return text;
  };

  const speakWithWebSpeech = (text: string, onEnd: () => void, speed?: string) => {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'vi-VN';
      
      if (speed === 'slow') {
        utterance.rate = 0.55;
      } else {
        utterance.rate = 0.85;
      }
      
      utterance.onend = () => onEnd();
      utterance.onerror = (e) => {
        console.error("Web Speech API error:", e);
        onEnd();
      };
      
      const voices = window.speechSynthesis.getVoices();
      const viVoice = voices.find(v => v.lang.startsWith('vi'));
      if (viVoice) {
        utterance.voice = viVoice;
      }
      
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error("SpeechSynthesis failed:", err);
      onEnd();
    }
  };

  const speak = async (text: string, onEnd: () => void, speed?: string, customAudioPath?: string) => {
    try {
      if (!text && !customAudioPath) return onEnd();
      
      const audio = audioRef.current || new Audio();
      if (!audioRef.current) audioRef.current = audio;
      
      audio.pause();
      audio.onended = onEnd;
      audio.onerror = (e) => {
        console.error("Audio error (falling back to Web Speech API):", e);
        speakWithWebSpeech(text, onEnd, speed);
      };

      if (customAudioPath) {
        audio.src = customAudioPath;
      } else {
        const audioUrl = `api/tts-proxy?text=${encodeURIComponent(text)}${speed ? `&speed=${speed}` : ''}`;
        audio.src = audioUrl;
      }
      
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error("Playback failed (likely iOS restriction or serverless env, falling back):", error);
          speakWithWebSpeech(text, onEnd, speed);
        });
      }
    } catch (error) {
      console.error("Speak error:", error);
      speakWithWebSpeech(text, onEnd, speed);
    }
  };

  const unlockAudio = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;
    // Play silent wave to unlock browser audio context
    audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA== "; 
    audio.play().then(() => {
      console.log("Audio context unlocked");
    }).catch(e => console.log("Unlock failed:", e));
  };

  const startDictation = () => {
    if (!passage) return;
    
    let list: DictationSegment[] = [];
    if (passage.sentences && passage.sentences.length > 0) {
      list = passage.sentences.map(s => {
        const wordCount = s.text.split(/\s+/).filter(w => w.length > 0).length;
        
        // Punctuation maps for fallback reading spelling
        const puncMap: Record<string, string> = {
          '.': 'dấu chấm',
          ',': 'dấu phẩy',
          ';': 'dấu chấm phẩy',
          ':': 'dấu hai chấm',
          '!': 'dấu chấm cảm',
          '?': 'dấu chấm hỏi',
          '-': 'dấu gạch ngang',
          '\n': 'xuống dòng'
        };
        let ttsText = s.text;
        Object.entries(puncMap).forEach(([symbol, name]) => {
          const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          ttsText = ttsText.replace(new RegExp(escapedSymbol, 'g'), ` ${name} `);
        });
        ttsText = ttsText.replace(/\s+/g, ' ').trim();

        return {
          originalText: s.text,
          text: ttsText,
          pauseTime: Math.round((wordCount < 6 ? 6 : 10) * pauseTimeMultiplier),
          audioClear: s.audioClear,
          audioWithPunc: s.audioWithPunc
        };
      });
    } else {
      list = splitIntoSegments(passage.content);
    }
    
    setSegments(list);
    setMode('dictation');
    setCurrentSegmentIndex(0);
    setRepeatCount(0);
    setIsDictating(true);
  };

  const stopDictation = () => {
    setIsDictating(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setCountdown(0);
  };

  useEffect(() => {
    if (isDictating && mode === 'dictation') {
      const segment = segments?.[currentSegmentIndex];
      if (!segment) {
        setIsDictating(false);
        return;
      }

      if (repeatCount < 3) {
        let selectedAudioPath: string | undefined = undefined;
        let textToSpeak = segment.originalText;
        
        // Decide voice type
        const voiceSelection = dictationVoiceType;

        if (voiceSelection === 'withPunc') {
          selectedAudioPath = segment.audioWithPunc;
          textToSpeak = segment.text; // processed spelled words if fallback TTS is used
        } else {
          selectedAudioPath = segment.audioClear;
          textToSpeak = segment.originalText;
        }

        speak(
          textToSpeak, 
          () => {
            let timeLeft = segment.pauseTime;
            setCountdown(timeLeft);
            
            const tick = () => {
              timeLeft -= 1;
              setCountdown(timeLeft);
              if (timeLeft > 0) {
                timerRef.current = setTimeout(tick, 1000);
              } else {
                setRepeatCount(prev => prev + 1);
              }
            };
            
            timerRef.current = setTimeout(tick, 1000);
          }, 
          repeatCount === 2 ? 'slow' : undefined,
          selectedAudioPath
        );
      } else {
        // Completed 3 readings of current segment, go to next segment
        if (currentSegmentIndex === (segments?.length || 0) - 1) {
          stopDictation();
          setMode('questions');
        } else {
          setRepeatCount(0);
          setCurrentSegmentIndex(prev => prev + 1);
        }
      }
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isDictating, currentSegmentIndex, repeatCount, segments, dictationVoiceType]);

  const handleAnswerSelect = (qIdx: number, oIdx: number) => {
    const newAnswers = [...userAnswers];
    newAnswers[qIdx] = oIdx;
    setUserAnswers(newAnswers);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eef7ff] to-[#f8fcff] flex flex-col font-sans text-slate-800 antialiased lg:h-screen lg:overflow-hidden relative">
      {/* Decorative blur circles */}
      <div className="fixed -top-12 -left-12 w-44 h-44 rounded-full bg-[#bcd4ff] opacity-30 blur-2xl pointer-events-none" />
      <div className="fixed top-[55%] -right-12 w-36 h-36 rounded-full bg-[#a9e7ff] opacity-30 blur-2xl pointer-events-none" />
      <div className="fixed bottom-10 left-12 w-24 h-24 rounded-full bg-[#d7cbff] opacity-30 blur-2xl pointer-events-none" />
      
      {/* Header Section */}
      <header className="h-20 bg-white border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between shrink-0 relative z-10">
        <div className="flex items-center gap-3 lg:gap-4">
          <button
            onClick={() => { setPassage(null); setTopic(''); stopDictation(); }}
            className="w-10 h-10 rounded-full bg-white shadow-sm border border-slate-100 flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:border-indigo-100 transition-colors"
            title="Trang chủ"
          >
            <Home className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="w-10 h-10 rounded-full bg-white shadow-sm border border-slate-100 flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:border-indigo-100 transition-colors"
            title="Cài đặt"
          >
            <Settings className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 bg-white rounded-2xl shadow-sm border border-slate-100 pl-2 pr-4 py-1.5">
            <div className="w-9 h-9 lg:w-10 lg:h-10 bg-gradient-to-br from-[#5b8cff] to-[#7aa8ff] rounded-xl flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-display text-base lg:text-lg font-bold text-slate-900">
              Bé học tiếng Việt
            </h1>
          </div>
        </div>
        
        {passage && (
          <div className="flex items-center gap-3 lg:gap-6">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tiến trình</span>
              <div className="w-24 lg:w-48 h-2 bg-slate-100 rounded-full mt-1 overflow-hidden">
                <motion.div 
                  className="h-full bg-indigo-500"
                  initial={{ width: 0 }}
                  animate={{ 
                    width: mode === 'dictation' 
                      ? `${(currentSegmentIndex / (segments.length || 1)) * 100}%` 
                      : mode === 'questions' ? '100%' : '5%'
                  }}
                />
              </div>
            </div>
            <button 
              onClick={() => { setPassage(null); setTopic(''); stopDictation(); }}
              className="p-2 rounded-full hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600 flex items-center gap-1.5 focus:outline-none"
              title="Quay lại danh sách bài học"
            >
              <ChevronLeft className="w-5 h-5 lg:w-6 lg:h-6" />
              <span className="text-xs font-bold hidden sm:inline text-slate-500">Quay lại</span>
            </button>
          </div>
        )}
      </header>

      {!passage ? (
        <main className="flex-1 overflow-y-auto p-4 lg:p-8 scrollbar-hide flex items-center justify-center">
          <div className="max-w-xl w-full mx-auto space-y-8 py-4 lg:py-8">
            <div className="text-center space-y-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-100 text-indigo-600 text-xs font-bold rounded-full uppercase tracking-wider">
                ✨ Giáo trình chính tả & đọc hiểu chuẩn
              </span>
              <h2 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight leading-tight">
                Bé học Tiếng Việt
              </h2>
              <p className="text-sm lg:text-base text-slate-500 font-medium max-w-sm mx-auto leading-relaxed">
                Học nghe viết chính tả chuẩn và rèn luyện tư duy đọc hiểu cùng các bài đọc lí thú!
              </p>
            </div>

            {lessons.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm space-y-4">
                <RefreshCw className="animate-spin text-indigo-600 mx-auto" size={32} />
                <p className="text-slate-500 font-semibold text-sm">Đang tải giáo trình học tập...</p>
              </div>
            ) : (
              <>
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-[32px] border border-slate-200/85 p-8 shadow-xl shadow-slate-100 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl -mr-16 -mt-16 opacity-50 select-none pointer-events-none" />
                  <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-50 rounded-full blur-3xl -ml-16 -mb-16 opacity-50 select-none pointer-events-none" />

                  <div className="relative space-y-8 text-center">
                    <div className="flex justify-center gap-4">
                      <div className="bg-slate-50 border border-slate-100 px-5 py-3 rounded-2xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tổng bài học</p>
                        <p className="text-2xl font-black text-slate-850">{lessons.length}</p>
                      </div>
                      <div className="bg-green-50/50 border border-green-100/70 px-5 py-3 rounded-2xl">
                        <p className="text-[10px] font-bold text-green-500 uppercase tracking-wider">Hoàn thành</p>
                        <p className="text-2xl font-black text-green-600">
                          {completedLessons.length} <span className="text-xs font-semibold text-slate-400">/{lessons.length}</span>
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 flex flex-col items-center gap-4">
                      <button
                        id="btn-random-lesson"
                        onClick={selectRandomLesson}
                        className="w-full sm:w-auto px-8 py-5 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 text-white rounded-full font-black text-base lg:text-lg hover:scale-105 active:scale-95 transition-all shadow-xl shadow-indigo-200 flex items-center justify-center gap-3 group focus:outline-none cursor-pointer"
                      >
                        <span className="text-2xl animate-bounce">🎲</span>
                        <span>Mở Một Bài Học Ngẫu Nhiên</span>
                      </button>
                      <p className="text-xs text-slate-400 font-bold select-none leading-normal max-w-xs mx-auto">
                        Hệ thống tự động lựa chọn bài đọc không lặp lại trong ít nhất 3 lượt chọn liên tiếp
                      </p>
                    </div>
                  </div>
                </motion.div>

                {/* Quy tắc học tập */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm"
                >
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 justify-center sm:justify-start">
                    <Info size={16} className="text-indigo-500" /> Quy tắc học tập của bé
                  </h2>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      "Mỗi câu sẽ được đọc 3 lần với giọng rõ ràng.",
                      "Có khoảng nghỉ để bé kịp viết vào tập.",
                      "Đọc tên các dấu câu để bé lưu ý viết đúng.",
                      "Sau khi viết xong, hãy trả lời câu hỏi đọc hiểu."
                    ].map((text, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <div className="mt-0.5 min-w-[20px] h-5 w-5 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xs shrink-0">
                          {idx + 1}
                        </div>
                        <p className="text-xs sm:text-sm leading-snug font-medium text-slate-600">{text}</p>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              </>
            )}
          </div>
        </main>
      ) : (
        <main className="flex-1 flex flex-col gap-4 lg:gap-8 p-4 lg:p-8 overflow-hidden">

          {/* Main Interaction Area */}
          <section className="flex-1 flex flex-col gap-6 overflow-hidden">
            {/* Mode Tabs */}
            <div className="flex bg-white p-1 rounded-full border border-slate-200 self-start shadow-sm shrink-0 w-full lg:w-auto overflow-x-auto scrollbar-hide">
              {[
                { id: 'reading', label: 'Bài Văn', icon: <BookOpen size={16} /> },
                { id: 'dictation', label: 'Viết Chính Tả', icon: <Volume2 size={16} /> },
                { id: 'questions', label: 'Đọc Hiểu', icon: <Send size={16} /> },
              ].map((tab) => (
                <button 
                  key={tab.id}
                  onClick={() => {
                    if (tab.id === 'dictation') startDictation();
                    else {
                      stopDictation();
                      setMode(tab.id as any);
                    }
                  }}
                  className={`flex-1 lg:flex-none px-4 lg:px-6 py-2.5 rounded-full text-xs lg:text-sm font-bold flex items-center justify-center gap-2 transition-all whitespace-nowrap ${
                    mode === tab.id 
                      ? 'bg-slate-900 text-white shadow-md' 
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {tab.icon} <span className="inline">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Content Display */}
            <div className="flex-1 bg-white rounded-[32px] lg:rounded-[40px] border border-slate-200 shadow-sm relative overflow-hidden flex flex-col min-h-0">
              <AnimatePresence mode="wait">
                {mode === 'reading' && (
                  <motion.div 
                    key="reading"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="flex-1 overflow-y-auto p-6 lg:p-12 scrollbar-hide"
                  >
                    <div className="max-w-2xl mx-auto space-y-6 lg:space-y-10">
                      <h2 className="text-2xl lg:text-4xl font-black text-center text-slate-900 tracking-tight leading-tight">
                        {passage.title}
                      </h2>
                      <div className="prose prose-slate max-w-none text-lg lg:text-xl leading-relaxed text-slate-700 whitespace-pre-wrap font-medium text-justify">
                        {passage.content}
                      </div>
                    </div>
                  </motion.div>
                )}

                {mode === 'dictation' && (
                  <motion.div 
                    key="dictation"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex-1 bg-slate-50 flex flex-col items-center justify-center gap-6 lg:gap-8 p-6 lg:p-12 relative min-h-[300px]"
                  >
                    {/* Tiến trình lặp lại (Lần 1, 2, 3) */}
                    <div className="flex items-center gap-3 bg-white px-5 py-2.5 rounded-2xl shadow-sm border border-slate-200/60 shrink-0">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lượt đọc câu này:</span>
                      <div className="flex gap-2">
                        {[0, 1, 2].map((i) => (
                          <div 
                            key={i} 
                            className={`w-8 h-2 rounded-full transition-all duration-500 ${
                              i < repeatCount ? 'bg-indigo-600' : i === repeatCount ? 'bg-indigo-400 animate-pulse' : 'bg-slate-200'
                            }`} 
                            title={`Lần đọc thứ ${i + 1}`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-4">
                      {countdown > 0 && (
                        <div className="w-fit bg-indigo-600 text-white px-4 py-1.5 rounded-xl flex flex-col items-center justify-center shadow-lg">
                          <span className="text-[8px] lg:text-[10px] font-bold uppercase opacity-70">Nghỉ</span>
                          <span className="text-lg lg:text-2xl font-black">{countdown}s</span>
                        </div>
                      )}
                      <div className="w-32 h-32 lg:w-40 lg:h-40 bg-white rounded-[40px] lg:rounded-[48px] flex items-center justify-center shadow-xl lg:shadow-2xl shadow-slate-200 relative">
                         <motion.div
                           animate={isDictating ? { scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] } : {}}
                           transition={{ repeat: Infinity, duration: 1.5 }}
                           className="text-indigo-600"
                         >
                           <EyeOff size={60} strokeWidth={1.5} />
                         </motion.div>
                      </div>
                    </div>

                    <div className="text-center space-y-2 lg:space-y-3 max-w-md">
                      <h3 className="text-xl lg:text-2xl font-bold text-slate-800 tracking-tight">
                        {isDictating ? 'Bé hãy lắng nghe và viết nhé!' : 'Tạm dừng đọc.'}
                      </h3>
                      <p className="text-xs lg:text-sm text-slate-400 font-medium px-4">Bé tập trung nghe để viết chính xác từng dấu câu, viết hoa tên riêng nhé.</p>
                      
                      {!isDictating && (
                        <button 
                          onClick={() => setIsDictating(true)}
                          className="mt-4 px-6 lg:px-8 py-2.5 lg:py-3 bg-indigo-600 text-white rounded-xl lg:rounded-2xl font-bold hover:scale-105 transition-all shadow-lg flex items-center justify-center gap-2 mx-auto text-sm"
                        >
                          <Play size={18} fill="currentColor" /> Tiếp tục nghe
                        </button>
                      )}
                    </div>

                    {/* Waveform Mockup */}
                    <div className="flex items-center gap-1 lg:gap-1.5 h-12 lg:h-16 mt-2 lg:mt-4">
                      {[6, 10, 8, 14, 6, 12, 8, 16, 10, 12, 6, 8, 14, 10].map((h, i) => (
                        <motion.div 
                          key={i}
                          animate={isDictating ? { height: [h*1.5, h*3, h*1.5] } : { height: h*1.5 }}
                          transition={{ repeat: Infinity, duration: 0.8 + Math.random(), delay: i * 0.1 }}
                          className="w-1.5 lg:w-2 bg-indigo-500 rounded-full"
                          style={{ minHeight: '6px' }}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}

                {mode === 'questions' && (
                  <motion.div 
                    key="questions"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex-1 flex flex-col lg:grid lg:grid-cols-2 lg:overflow-hidden overflow-y-auto scrollbar-hide"
                  >
                    {/* Left/Top Panel: Reading Reference */}
                    <div className="shrink-0 lg:shrink lg:h-full overflow-y-visible lg:overflow-y-auto border-b lg:border-b-0 lg:border-r border-slate-100 bg-slate-50/50 p-6 lg:p-12">
                      <div className="max-w-2xl mx-auto space-y-4 lg:space-y-6">
                        <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-white w-fit px-3 py-1 rounded-full border border-slate-200 shadow-sm">
                          <BookOpen size={12} /> Tài liệu tham khảo
                        </div>
                        <h2 className="text-xl lg:text-3xl font-black text-slate-900 leading-tight">
                          {passage.title}
                        </h2>
                        <div className="prose prose-slate max-w-none text-lg lg:text-2xl leading-relaxed text-slate-700 whitespace-pre-wrap font-bold text-justify">
                          {passage.content}
                        </div>
                      </div>
                    </div>

                    {/* Right/Bottom Panel: Questions */}
                    <div className="flex-1 lg:h-full overflow-y-visible lg:overflow-y-auto p-6 lg:p-12">
                      <div className="max-w-2xl mx-auto space-y-8 lg:space-y-12 pb-20">
                        <div className="flex items-center gap-4 mb-4 lg:mb-8">
                           <div className="w-10 h-10 lg:w-12 lg:h-12 bg-green-50 rounded-xl lg:rounded-2xl flex items-center justify-center text-green-600">
                             <CheckCircle2 size={24} lg:size={28} />
                           </div>
                           <h3 className="text-lg lg:text-2xl font-bold text-slate-800 tracking-tight">Bé nhớ bài đến đâu rồi?</h3>
                        </div>

                        {passage.questions.length === 0 ? (
                          <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-6 max-w-xl mx-auto shadow-sm my-4">
                            <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto text-amber-500">
                              <Info size={32} />
                            </div>
                            <div className="space-y-2">
                              <h4 className="text-lg lg:text-xl font-black text-slate-800">Bài đọc này chưa có câu hỏi luyện tập</h4>
                              <p className="text-sm text-slate-500 font-medium leading-relaxed">
                                Bài thơ/bài văn "<strong>{passage.title}</strong>" hiện tại chưa được soạn câu hỏi đọc hiểu trong cơ sở dữ liệu. Bé hãy chọn các bài học sau để cùng trả lời câu hỏi đọc hiểu nhé:
                              </p>
                            </div>
                            
                            <div className="space-y-3 pt-2">
                              {lessons.filter(ls => Array.isArray(ls.questions) && ls.questions.length > 0).slice(0, 3).map((ls) => (
                                <button
                                  key={ls.id}
                                  onClick={() => startLesson(ls)}
                                  className="w-full p-4 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 rounded-2xl font-bold text-sm text-left border border-slate-100 hover:border-indigo-100 transition-all flex items-center justify-between group focus:outline-none"
                                >
                                  <span>📖 {ls.title}</span>
                                  <span className="text-xs text-indigo-500 bg-white group-hover:bg-indigo-100/50 px-2.5 py-1 rounded-lg border border-slate-100 transition-colors">
                                    {ls.questions.length} câu hỏi
                                  </span>
                                </button>
                              ))}
                            </div>

                            <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
                              <button
                                onClick={selectRandomLesson}
                                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-bold text-sm hover:scale-105 transition-all shadow-md focus:outline-none"
                              >
                                🎲 Thử ngẫu nhiên bài khác
                              </button>
                              <button
                                onClick={() => { setPassage(null); setTopic(''); }}
                                className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full font-bold text-sm hover:scale-105 transition-all focus:outline-none"
                              >
                                Quay về danh sách
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {passage.questions.map((q, qIdx) => {
                              const isMultipleChoice = Array.isArray(q.options) && q.options.length > 0;
                              
                              if (isMultipleChoice) {
                                return (
                                  <div key={qIdx} className="space-y-4 lg:space-y-6 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                                    <div className="flex gap-3 lg:gap-4">
                                      <span className="flex-shrink-0 w-6 h-6 lg:w-8 lg:h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs lg:text-sm font-black italic">
                                        {qIdx + 1}
                                      </span>
                                      <p className="text-base lg:text-xl font-bold text-slate-700 pt-0.5">{q.question}</p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:gap-4 pl-0 sm:pl-12">
                                      {q.options!.map((opt, oIdx) => (
                                        <button 
                                          key={oIdx}
                                          onClick={() => !showResults && handleAnswerSelect(qIdx, oIdx)}
                                          className={`p-4 lg:p-5 rounded-[20px] lg:rounded-[24px] text-left transition-all border-2 text-sm lg:text-base font-medium relative group focus:outline-none ${
                                            userAnswers[qIdx] === oIdx 
                                              ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm' 
                                              : 'border-slate-100 hover:border-slate-200 bg-slate-50 text-slate-600'
                                          } ${
                                            showResults && oIdx === q.answer 
                                              ? 'border-green-500 bg-green-50 ring-4 ring-green-100' 
                                              : ''
                                          } ${
                                            showResults && userAnswers[qIdx] === oIdx && oIdx !== q.answer 
                                              ? 'border-red-300 bg-red-50 opacity-80' 
                                              : ''
                                          }`}
                                        >
                                          <span className={`inline-flex items-center justify-center w-5 h-5 lg:w-6 lg:h-6 rounded-lg mr-2 lg:mr-3 text-[10px] lg:text-xs font-black ${
                                            userAnswers[qIdx] === oIdx ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200'
                                          }`}>
                                            {String.fromCharCode(65 + oIdx)}
                                          </span> 
                                          {opt}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                );
                              } else {
                                const isRevealed = showResults || userAnswers[qIdx] === 1;
                                return (
                                  <div key={qIdx} className="space-y-4 lg:space-y-6 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                                    <div className="flex gap-3 lg:gap-4">
                                      <span className="flex-shrink-0 w-6 h-6 lg:w-8 lg:h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs lg:text-sm font-black italic">
                                        {qIdx + 1}
                                      </span>
                                      <p className="text-base lg:text-xl font-bold text-slate-800 pt-0.5">{q.question}</p>
                                    </div>
                                    <div className="pl-0 sm:pl-12 space-y-4">
                                      {!showResults && (
                                        <textarea
                                          id={`q-textarea-${qIdx}`}
                                          placeholder="Bé hãy suy nghĩ câu trả lời hoặc điền vào đây nhé..."
                                          rows={2}
                                          className="w-full text-sm p-4 rounded-xl border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none outline-none font-medium transition-all"
                                          onChange={() => {
                                            if (userAnswers[qIdx] === null) {
                                              handleAnswerSelect(qIdx, 1);
                                            }
                                          }}
                                        />
                                      )}
                                      <div className="flex items-center gap-3">
                                        <button
                                          onClick={() => handleAnswerSelect(qIdx, 1)}
                                          className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 focus:outline-none ${
                                            isRevealed 
                                              ? 'bg-green-50 text-green-700 border border-green-200'
                                              : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-100'
                                          }`}
                                        >
                                          {isRevealed ? '✔️ Đã xem đáp án gợi ý' : '👁️ Xem đáp án gợi ý'}
                                        </button>
                                      </div>
                                      <AnimatePresence>
                                        {isRevealed && (
                                          <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="bg-green-50/50 p-4 rounded-2xl border border-green-100/70"
                                          >
                                            <p className="text-xs uppercase font-bold text-green-600 tracking-wider mb-1 flex items-center gap-1">
                                              🌟 Đáp án gợi ý:
                                            </p>
                                            <p className="text-sm sm:text-base font-bold text-slate-700 italic">
                                              "{q.answer}"
                                            </p>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                  </div>
                                );
                              }
                            })}

                            {!showResults ? (
                              <div className="pt-8 flex justify-center pb-8">
                                <button 
                                  onClick={() => setShowResults(true)}
                                  disabled={userAnswers.includes(null)}
                                  className="w-full lg:w-auto bg-slate-900 text-white px-10 lg:px-16 py-4 lg:py-5 rounded-full font-black text-base lg:text-lg hover:scale-105 transition-all shadow-xl shadow-slate-200 disabled:bg-slate-300 disabled:scale-100 disabled:shadow-none"
                                >
                                  Hoàn thành bài tập
                                </button>
                              </div>
                            ) : (
                              <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="pt-8 text-center p-6 lg:p-12 bg-white rounded-[32px] lg:rounded-[48px] border-2 border-slate-100 shadow-sm mb-8"
                              >
                                <h4 className="text-2xl lg:text-3xl font-black text-slate-900 mb-2">Đã xem hết các câu trả lời</h4>
                                <p className="text-base lg:text-lg text-slate-500 font-medium mb-8 lg:mb-10">
                                  Cùng xem lại các câu trả lời ở trên để biết câu nào đúng, câu nào cần ôn lại nhé!
                                </p>
                                <div className="flex flex-col sm:flex-row gap-3 lg:gap-4 justify-center">
                                  <button 
                                    onClick={() => { setPassage(null); setTopic(''); setShowResults(false); }}
                                    className="bg-slate-900 text-white px-8 lg:px-10 py-4 lg:py-5 rounded-full font-bold hover:scale-105 transition-all shadow-lg text-sm lg:text-base focus:outline-none"
                                  >
                                    Bài học khác
                                  </button>
                                  <button 
                                    onClick={() => { setMode('reading'); setShowResults(false); setUserAnswers(passage ? passage.questions.map(() => null) : []); }}
                                    className="bg-slate-100 text-slate-600 px-8 lg:px-10 py-4 lg:py-5 rounded-full font-bold hover:bg-slate-200 transition-all font-medium text-sm lg:text-base focus:outline-none"
                                  >
                                    Xem lại bài
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Playback Controls Area */}
            {mode === 'dictation' && (
              <div className="flex flex-col gap-3 shrink-0">
                {/* 2 Nút chọn chế độ đọc chính tả */}
                <div className="flex justify-center items-center gap-3">
                  <button
                    onClick={() => setDictationVoiceType('withPunc')}
                    className={`min-w-[150px] justify-center px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 transition-colors ${
                      dictationVoiceType === 'withPunc'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'bg-white text-slate-500 border border-slate-200'
                    }`}
                  >
                    <span>✍️ Đọc có dấu</span>
                  </button>
                  <button
                    onClick={() => setDictationVoiceType('clear')}
                    className={`min-w-[150px] justify-center px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 transition-colors ${
                      dictationVoiceType === 'clear'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'bg-white text-slate-500 border border-slate-200'
                    }`}
                  >
                    <span>🗣️ Đọc không dấu</span>
                  </button>
                </div>

                {/* Thanh điều khiển chính */}
                <div className="h-auto py-4 lg:h-24 bg-white rounded-[24px] lg:rounded-[32px] border border-slate-200 flex flex-col md:flex-row items-center justify-between px-4 lg:px-10 shadow-sm gap-4">
                  <button 
                    onClick={() => {
                      stopDictation();
                      setCurrentSegmentIndex(Math.max(0, currentSegmentIndex - 1));
                      setIsDictating(true);
                    }}
                    disabled={currentSegmentIndex === 0}
                    className="hidden md:flex items-center gap-2 text-slate-500 hover:text-slate-800 font-bold transition-colors disabled:opacity-30 text-sm"
                  >
                    <ChevronLeft size={20} />
                    Câu trước
                  </button>

                  <div className="flex items-center gap-6 lg:gap-8 w-full md:w-auto justify-center">
                    <button 
                      onClick={() => {
                        stopDictation();
                        setRepeatCount(0);
                        setIsDictating(true);
                      }}
                      className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-colors"
                    >
                       <RefreshCw size={20} lg:size={24} />
                    </button>
                    
                    <button 
                      onClick={() => setIsDictating(!isDictating)}
                      className="w-12 h-12 lg:w-16 lg:h-16 bg-slate-900 rounded-full flex items-center justify-center text-white shadow-xl hover:scale-110 transition-transform"
                    >
                      {isDictating ? <Pause size={24} lg:size={32} /> : <Play size={24} lg:size={32} className="ml-1" />}
                    </button>

                    <button 
                      onClick={() => {
                        stopDictation();
                        setCurrentSegmentIndex(Math.min(currentSegmentIndex + 1, (segments.length || 1) - 1));
                        setIsDictating(true);
                      }}
                      disabled={currentSegmentIndex === segments.length - 1}
                      className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-colors disabled:opacity-30"
                    >
                      <SkipForward size={24} lg:size={28} />
                    </button>
                  </div>

                  <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                    <div className="flex flex-col items-center">
                       <span className="text-[8px] lg:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tiến độ</span>
                       <span className="text-base lg:text-xl font-mono font-bold text-indigo-600">
                          {Math.floor((currentSegmentIndex / (segments.length || 1)) * 100)}%
                       </span>
                    </div>
                    <button 
                      onClick={() => { stopDictation(); setMode('questions'); }}
                      className="px-4 lg:px-8 py-2.5 lg:py-3 bg-indigo-50 text-indigo-600 rounded-full font-black text-xs lg:text-sm hover:bg-indigo-100 transition-colors border border-indigo-100 shadow-sm"
                    >
                      Kết thúc viết
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {mode === 'reading' && (
              <div className="h-auto py-4 lg:h-24 bg-white rounded-[24px] lg:rounded-[32px] border border-slate-200 flex items-center justify-center px-4 lg:px-10 shadow-sm shrink-0">
                  <button 
                    onClick={startDictation}
                    className="w-full lg:w-auto px-8 lg:px-12 py-3 lg:py-4 bg-indigo-600 text-white rounded-full font-black text-base lg:text-lg hover:scale-105 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-3"
                  >
                    <Volume2 size={20} /> Bắt đầu nghe chép
                  </button>
              </div>
            )}
          </section>
        </main>
      )}

      {/* Footer Bar */}
      <footer className="h-10 lg:h-12 border-t border-slate-100 px-4 lg:px-8 hidden sm:flex items-center justify-center bg-white text-[10px] lg:text-[11px] text-slate-400 shrink-0 font-medium">
        <span className="font-medium text-slate-500 italic text-center">“Học tập là chìa khóa mở ra kho báu tri thức.”</span>
      </footer>
    </div>
  );
}

