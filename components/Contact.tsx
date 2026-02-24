import React, { useContext } from 'react';
import { motion } from 'motion/react';
import { AppContext } from '../App';
import {
    Github, Globe, Mail, MapPin, GraduationCap, Code2,
    User, Heart, Calendar, Briefcase, Sparkles, ArrowUpRight,
    Terminal, Smartphone, Monitor, Cpu
} from 'lucide-react';

export const Contact: React.FC = () => {
    const { t } = useContext(AppContext);

    const personalInfo = {
        name: "Abir Hasan Siam",
        role: "Full-Stack Developer & UI Architect",
        dob: "17 November 2002",
        age: "22",
        location: "Gazipur, Dhaka, Bangladesh",
        origin: "Tangail",
        blood: "B+",
        email: "abir2afridi@gmail.com",
        github: "github.com/abir2afridi",
        portfolio: "https://abir2afridi.vercel.app/"
    };

    const education = [
        {
            school: "Independent University of Bangladesh",
            degree: "BSc in Computer Science",
            period: "2021 - Present",
            details: "Specializing in high-performance software systems and AI integration."
        },
        {
            school: "Misir Ali Khan Memorial School & College",
            degree: "Higher Secondary Certificate (HSC)",
            period: "2019 - 2020",
            details: "Academic excellence in Science and Analytical Mathematics."
        },
        {
            school: "Professor MEH Arif Secondary School",
            degree: "Secondary School Certificate (SSC)",
            period: "2017 - 2018",
            details: "Foundational technical studies with focus on Logic and Physics."
        }
    ];

    const techSkills = [
        { category: "Languages", icon: Code2, items: ["Dart (Flutter)", "React (TS/JS)", "Python"] },
        { category: "Platforms", icon: Smartphone, items: ["Android APK", "Web Apps", "Cross-Platform"] },
        { category: "Systems", icon: Monitor, items: ["Windows", "Linux", "Virtual Machines"] },
        { category: "Infrastructure", icon: Terminal, items: ["Git/GitHub", "CMake", "Terminal Operations"] }
    ];

    const philosophy = [
        { title: "Clean Architecture", desc: "Maintaining strict project structures for maximum maintainability." },
        { title: "Technical Clarity", desc: "Preferring step-by-step logic and clear documentation for every module." },
        { title: "First-Launch Focus", desc: "Obsessing over the initial user experience and onboarding flow." },
        { title: "OS Agnostic", desc: "Ensuring multi-platform compatibility across Windows, Linux, and Web." }
    ];

    return (
        <div className="flex-1 bg-[#f3f1ea] dark:bg-slate-900 h-full overflow-y-auto custom-scrollbar p-6 md:p-12 transition-colors duration-300">
            <div className="max-w-5xl mx-auto space-y-32 py-10 md:py-20">

                {/* Minimal Header - About Style */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-10"
                >
                    <div className="flex items-center gap-4">
                        <div className="text-[10px] font-black uppercase tracking-[0.5em] text-brand-500">The Architect</div>
                        <div className="h-px w-20 bg-brand-500/20" />
                    </div>
                    <h1 className="text-7xl md:text-9xl font-black tracking-tighter text-gray-900 dark:text-white leading-[0.8]">
                        Abir Hasan <br />
                        <span className="text-transparent" style={{ WebkitTextStroke: '2px currentColor' }}>Siam.</span>
                    </h1>
                    <p className="text-xl text-gray-500 dark:text-gray-400 max-w-xl font-medium leading-relaxed">
                        Detail-oriented developer obsessed with efficient UI design and multi-platform orchestration.
                    </p>
                </motion.div>

                {/* Developer Activity Ticker */}
                <div className="overflow-hidden whitespace-nowrap border-y border-gray-200 dark:border-white/5 py-4 bg-white/30 dark:bg-white/2">
                    <motion.div
                        initial={{ x: 0 }}
                        animate={{ x: "-50%" }}
                        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                        className="flex items-center gap-12 w-fit px-12"
                    >
                        {[
                            "STATUS: AVAILABLE FOR COLLABORATION",
                            "STACK: FLUTTER / REACT / PYTHON",
                            "LOCATION: GAZIPUR / DHAKA",
                            "PHILOSOPHY: CLEAN ARCHITECTURE",
                            "FOCUS: MULTI-PLATFORM ORCHESTRATION",
                            "CONTRIBUTION: PRIVATE ENABLED",
                            "STATUS: AVAILABLE FOR COLLABORATION",
                            "STACK: FLUTTER / REACT / PYTHON",
                            "LOCATION: GAZIPUR / DHAKA",
                            "PHILOSOPHY: CLEAN ARCHITECTURE",
                            "FOCUS: MULTI-PLATFORM ORCHESTRATION",
                            "CONTRIBUTION: PRIVATE ENABLED"
                        ].map((text, i) => (
                            <div key={i} className="flex items-center gap-4">
                                <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-900 dark:text-white">
                                    {text}
                                </span>
                            </div>
                        ))}
                    </motion.div>
                </div>

                {/* Identity Matrix */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-12 pt-10 border-t border-gray-200 dark:border-white/5">
                    {[
                        { label: "Origin & Base", val: `${personalInfo.origin} · ${personalInfo.location}` },
                        { label: "Identity", val: `${personalInfo.dob} (Age ${personalInfo.age})` },
                        { label: "System Status", val: `Blood Group ${personalInfo.blood} · Active` }
                    ].map((item, i) => (
                        <div key={i} className="space-y-2">
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-brand-500">{item.label}</p>
                            <p className="text-lg font-bold text-gray-900 dark:text-white">{item.val}</p>
                        </div>
                    ))}
                </div>

                {/* Main Content Sections */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-20">

                    {/* Skills & Tech Section */}
                    <div className="lg:col-span-12 space-y-16">
                        <div className="space-y-12">
                            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-gray-400">Technical Capability</h2>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
                                {techSkills.map((skill, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 10 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.1 }}
                                        viewport={{ once: true }}
                                        className="space-y-4"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-white dark:bg-white/5 flex items-center justify-center text-brand-500">
                                            <skill.icon className="w-5 h-5" />
                                        </div>
                                        <h3 className="text-xs font-black uppercase tracking-widest text-gray-900 dark:text-white">{skill.category}</h3>
                                        <ul className="space-y-2">
                                            {skill.items.map((item, idx) => (
                                                <li key={idx} className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                                    <div className="w-1 h-1 rounded-full bg-brand-500/30" />
                                                    {item}
                                                </li>
                                            ))}
                                        </ul>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Left: Philosophy & Education */}
                    <div className="lg:col-span-7 space-y-24">
                        {/* Education */}
                        <div className="space-y-12">
                            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-gray-400">Academic Roadmap</h2>
                            <div className="space-y-10 relative">
                                <div className="absolute left-1 top-2 bottom-2 w-px bg-gray-200 dark:bg-white/5" />
                                {education.map((edu, i) => (
                                    <div key={i} className="pl-8 relative group">
                                        <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-gray-200 dark:bg-white/10 group-hover:bg-brand-500 transition-colors" />
                                        <h4 className="text-sm font-black text-gray-900 dark:text-white leading-tight mb-1">{edu.school}</h4>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-brand-500 mb-2">{edu.degree} · {edu.period}</p>
                                        <p className="text-xs text-gray-500 font-medium leading-relaxed">{edu.details}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Philosophy */}
                        <div className="space-y-12">
                            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-gray-400">Notable Practices</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
                                {philosophy.map((item, i) => (
                                    <div key={i} className="space-y-3">
                                        <h5 className="text-xs font-black uppercase tracking-widest text-gray-900 dark:text-white flex items-center gap-2">
                                            <div className="w-1 h-1 bg-brand-500 rounded-full" />
                                            {item.title}
                                        </h5>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium leading-relaxed">{item.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right: Connect / Call to Action */}
                    <div className="lg:col-span-5">
                        <div className="sticky top-10 space-y-12 bg-white dark:bg-white/5 p-10 rounded-[3rem] border border-gray-100 dark:border-white/5">
                            <h2 className="text-2xl font-black text-gray-900 dark:text-white">Direct Connect.</h2>
                            <div className="space-y-4">
                                {[
                                    { label: "Email", val: personalInfo.email, link: `mailto:${personalInfo.email}`, icon: Mail },
                                    { label: "Github", val: personalInfo.github, link: `https://${personalInfo.github}`, icon: Github },
                                    { label: "Portfolio", val: "abir2afridi.vercel.app", link: personalInfo.portfolio, icon: Globe }
                                ].map((item, i) => (
                                    <a
                                        key={i}
                                        href={item.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-between p-5 rounded-2xl bg-gray-50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-white/5 border border-transparent hover:border-brand-500/20 transition-all group"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-brand-500 shadow-sm transition-transform group-hover:scale-110">
                                                <item.icon className="w-5 h-5" />
                                            </div>
                                            <div className="space-y-0.5">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{item.label}</p>
                                                <p className="text-xs font-bold text-gray-900 dark:text-white">{item.val}</p>
                                            </div>
                                        </div>
                                        <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-brand-500 transition-colors" />
                                    </a>
                                ))}
                            </div>
                            <div className="pt-6">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">Gazipur · Dhaka · Bangladesh</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Traits Footer */}
                <div className="pt-20 border-t border-gray-200 dark:border-white/5 flex flex-col md:flex-row justify-between items-center gap-8 text-[9px] font-black uppercase tracking-[0.3em] text-gray-400">
                    <div className="flex gap-8">
                        <span>Detail-Oriented</span>
                        <span>Experimental</span>
                        <span>Professional</span>
                    </div>
                    <div className="flex gap-8">
                        <span>Available for Hire</span>
                        <div className="flex items-center gap-2 text-brand-500">
                            <div className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
                            Live Portfolio Status
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
