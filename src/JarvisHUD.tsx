import { useEffect, useRef, useState } from 'react';
import './JarvisHUD.css';

interface JarvisHUDProps {
    status: 'initializing' | 'idle' | 'listening' | 'speaking' | 'processing';
}

export function JarvisHUD({ status }: JarvisHUDProps) {
    const [audioData, setAudioData] = useState<number[]>(Array(48).fill(0));
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    useEffect(() => {
        console.log('[HUD] Status changed to:', status);

        const isActive = status === 'listening' || status === 'speaking';

        if (isActive && !audioContextRef.current) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    const audioContext = new AudioContext();
                    const analyser = audioContext.createAnalyser();
                    const source = audioContext.createMediaStreamSource(stream);

                    analyser.fftSize = 128;
                    analyser.smoothingTimeConstant = 0.7;
                    source.connect(analyser);

                    audioContextRef.current = audioContext;
                    analyserRef.current = analyser;

                    const updateAudioData = () => {
                        if (analyserRef.current) {
                            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
                            analyserRef.current.getByteFrequencyData(dataArray);
                            setAudioData(Array.from(dataArray).slice(0, 48));
                        }
                        if (status === 'listening' || status === 'speaking') {
                            animationFrameRef.current = requestAnimationFrame(updateAudioData);
                        }
                    };
                    updateAudioData();
                })
                .catch(err => console.error('[HUD] Mic error:', err));
        }

        if (!isActive && audioContextRef.current) {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            audioContextRef.current.close();
            audioContextRef.current = null;
            analyserRef.current = null;
            setAudioData(Array(48).fill(0));
        }

        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [status]);

    const getStatusText = () => {
        switch (status) {
            case 'initializing': return 'INIT';
            case 'idle': return 'SLEEP';
            case 'listening': return 'LISTEN';
            case 'speaking': return 'SPEAK';
            case 'processing': return 'WORK';
            default: return 'OFF';
        }
    };

    const isActive = status === 'listening' || status === 'speaking' || status === 'processing';
    const glowIntensity = isActive ? 1 : 0.6;

    return (
        <div className="jarvis-container">
            <svg className="jarvis-hud" viewBox="0 0 280 280">
                <defs>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                    <filter id="strongGlow">
                        <feGaussianBlur stdDeviation="5" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* OUTER DOTS */}
                <g className="ring-rotate-slow">
                    {Array.from({ length: 3 }).map((_, segIdx) =>
                        Array.from({ length: 15 }).map((_, i) => {
                            const angle = ((segIdx * 120) + (i / 15) * 70 - 90) * (Math.PI / 180);
                            const r = 132;
                            return (
                                <circle key={`${segIdx}-${i}`} cx={140 + r * Math.cos(angle)} cy={140 + r * Math.sin(angle)}
                                    r="1" fill="#00d4ff" opacity={0.6 * glowIntensity} filter="url(#glow)" />
                            );
                        })
                    )}
                </g>

                {/* OUTER BLOCKS */}
                <g className="ring-rotate-medium">
                    {Array.from({ length: 24 }).map((_, i) => {
                        if (i % 2 !== 0) return null;
                        const angle = (i * 15 - 90) * (Math.PI / 180);
                        return (
                            <line key={i} x1={140 + 120 * Math.cos(angle)} y1={140 + 120 * Math.sin(angle)}
                                x2={140 + 126 * Math.cos(angle)} y2={140 + 126 * Math.sin(angle)}
                                stroke="#00d4ff" strokeWidth="5" opacity={0.7 * glowIntensity} filter="url(#glow)" />
                        );
                    })}
                </g>

                {/* TICK MARKS */}
                <g>
                    {Array.from({ length: 80 }).map((_, i) => {
                        const angle = (i * 4.5 - 90) * (Math.PI / 180);
                        const r1 = 109;
                        const r2 = i % 5 === 0 ? 112 : 110;
                        return (
                            <line key={i} x1={140 + r1 * Math.cos(angle)} y1={140 + r1 * Math.sin(angle)}
                                x2={140 + r2 * Math.cos(angle)} y2={140 + r2 * Math.sin(angle)}
                                stroke="#00d4ff" strokeWidth="0.6" opacity={(i % 10 === 0 ? 0.8 : 0.4) * glowIntensity} />
                        );
                    })}
                </g>

                {/* WAVEFORM */}
                {isActive && (
                    <g>
                        {audioData.map((value, i) => {
                            const angle = ((i / audioData.length) * 360 - 90) * (Math.PI / 180);
                            const baseR = 95;
                            const amplitude = (value / 255) * 18;
                            return (
                                <line key={i} x1={140 + baseR * Math.cos(angle)} y1={140 + baseR * Math.sin(angle)}
                                    x2={140 + (baseR + amplitude) * Math.cos(angle)} y2={140 + (baseR + amplitude) * Math.sin(angle)}
                                    stroke="#00ffff" strokeWidth="2" opacity={0.5 + (value / 255) * 0.5} filter="url(#strongGlow)" />
                            );
                        })}
                    </g>
                )}

                {/* INNER CIRCLE */}
                <circle cx="140" cy="140" r="87" fill="none" stroke="#00d4ff" strokeWidth="1" opacity={0.8 * glowIntensity} filter="url(#glow)" />

                {/* INNER DOTS */}
                <g className="ring-rotate-reverse">
                    {Array.from({ length: 40 }).map((_, i) => {
                        const angle = (i * 9 - 90) * (Math.PI / 180);
                        const size = i % 5 === 0 ? 1.5 : 1;
                        return (
                            <rect key={i} x={140 + 78 * Math.cos(angle) - size / 2} y={140 + 78 * Math.sin(angle) - size / 2}
                                width={size} height={size} fill="#00d4ff" opacity={0.6 * glowIntensity} />
                        );
                    })}
                </g>

                {/* CORE */}
                <circle cx="140" cy="140" r="67" fill="none" stroke="#00ffff" strokeWidth="1.5"
                    opacity={status === 'speaking' ? 0.95 : 0.7} filter="url(#strongGlow)"
                    className={status === 'speaking' ? 'pulse' : ''} />

                {/* TEXT */}
                <text x="140" y="135" textAnchor="middle" fill="#00ffff" fontSize="16"
                    fontFamily="Courier New" fontWeight="bold" letterSpacing="3" filter="url(#strongGlow)">
                    F.R.I.D.A.Y
                </text>
                <text x="140" y="152" textAnchor="middle" fill="#00d4ff" fontSize="7"
                    fontFamily="Courier New" letterSpacing="1.5" opacity="0.85">
                    {getStatusText()}
                </text>
            </svg>
        </div>
    );
}
