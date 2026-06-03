"use client";
import React, { useState, useEffect } from 'react';
import { auth, db } from "./lib/firebase";
import Navbar from "./components/Navbar"; 
import {
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  User
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const ROLES = [
  "Homeowner", "Contractor", "Builder", "Architect", 
  "Engineer", "Construction Firm", "Designer"
];

const PRO_ROLES = [
  "Contractor", "Builder", "Architect", 
  "Engineer", "Construction Firm", "Designer"
];

const GENDERS = ["Male", "Female", "Other", "Prefer not to say"];
const PRESET_AVATARS = ["👨‍💼", "👩‍💼", "👷‍♂️", "👷‍♀️", "👤"];

export default function Dashboard() {
  const router = useRouter();
  
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<Record<string, any> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [profileForm, setProfileForm] = useState({
    role: ROLES[0],
    name: "",
    phone: "",
    gender: GENDERS[0],
    avatar: PRESET_AVATARS[0]
  });

  // UX State for the Welcome Greeting
  const [showWelcome, setShowWelcome] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setAuthError("");
        
        try {
          const docRef = doc(db, "users", currentUser.uid);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            setUserData(docSnap.data());
            setIsOnboarding(false);
          } else {
            setProfileForm(prev => ({
              ...prev,
              name: currentUser.displayName || "", 
            }));
            setIsOnboarding(true); 
          }
        } catch (error: any) {
          console.error("Firestore Error:", error);
          setAuthError("Could not connect to the database. Check your internet connection.");
          await signOut(auth);
        }
      } else {
        setUser(null);
        setUserData(null);
        setIsOnboarding(false);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Timer to hide the "Welcome" portion of the greeting after 4 seconds
  useEffect(() => {
    if (userData) {
      const timer = setTimeout(() => {
        setShowWelcome(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [userData]);

  const handleGoogleAuth = async () => {
    setAuthError("");
    setIsLoading(true);
    const provider = new GoogleAuthProvider();

    try {
      await signInWithPopup(auth, provider); 
    } catch (error: any) {
      console.error("Google Auth Error:", error);
      setAuthError(error.message || "Google Sign-In failed.");
      setIsLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setIsLoading(true);

    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      console.error("Auth Error:", error);
      setAuthError(error.message || "Authentication failed. Please check your credentials.");
      setIsLoading(false);
    }
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event: any) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 200;
        let { width, height } = img;
        if (width > height) {
          if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
        } else {
          if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
        }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setProfileForm({ ...profileForm, avatar: compressedDataUrl });
      };
      img.src = event.target.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    
    if (!profileForm.name.trim() || !profileForm.phone.trim()) {
      return setAuthError("Please fill in your Name and Phone Number.");
    }
    
    if (!user) return; 

    setIsLoading(true);
    try {
      const newUserData = {
        uid: user.uid,
        name: profileForm.name.trim(),
        phone: profileForm.phone.trim(),
        email: user.email?.toLowerCase(),
        role: profileForm.role,
        gender: profileForm.gender,
        avatar: profileForm.avatar,
        tier: "standard", 
        isFeatured: false,
        popularityScore: 0,
        createdAt: serverTimestamp()
      };
      
      await setDoc(doc(db, "users", user.uid), newUserData);
      setUserData(newUserData);
      setIsOnboarding(false); 
    } catch (error: any) {
      console.error("Onboarding Error:", error);
      setAuthError("Failed to save profile. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-12 h-12 border-4 border-[#22c55e] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md bg-white border border-gray-100 rounded-2xl p-8 shadow-xl">
          <div className="text-center mb-8">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-16 h-16 mx-auto mb-4">
              <path d="M 50 15 A 35 35 0 1 0 85 50" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" className="text-gray-900" />
              <path d="M 50 15 L 85 15 L 85 50" fill="none" stroke="#22c55e" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Welcome To OkiConstruct
            </h1>
            <p className="text-gray-500 text-sm uppercase tracking-wider font-semibold">Generate BOQ & Track Expense</p>
          </div>

          {authError && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-6 text-sm font-medium">{authError}</div>}

          <button onClick={handleGoogleAuth} type="button" className="w-full bg-white text-gray-700 border border-gray-200 rounded-xl p-3 font-semibold flex items-center justify-center gap-3 hover:bg-gray-50 transition-colors shadow-sm mb-6">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center justify-between mb-6">
            <hr className="w-full border-gray-100" />
            <span className="p-2 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-white">Or</span>
            <hr className="w-full border-gray-100" />
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Email Address</label>
              <input type="email" required className="w-full border border-gray-200 rounded-lg p-3 mt-1 text-gray-900 focus:ring-2 focus:ring-[#22c55e]/20 outline-none" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{isRegistering ? "Set Password" : "Password"}</label>
              <input type="password" required className="w-full border border-gray-200 rounded-lg p-3 mt-1 text-gray-900 focus:ring-2 focus:ring-[#22c55e]/20 outline-none" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <button type="submit" className="w-full bg-[#22c55e] text-white rounded-xl p-3.5 font-semibold text-base hover:bg-[#1ea950] transition-colors shadow-md mt-4">
              {isRegistering ? "Create Account" : "Sign In"}
            </button>
          </form>

          <div className="mt-8 text-center">
            <button onClick={() => {setIsRegistering(!isRegistering); setAuthError("");}} className="text-sm text-gray-500 hover:text-gray-900 font-medium transition-colors">
              {isRegistering ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (isOnboarding) {
    const isSelectedPro = PRO_ROLES.includes(profileForm.role);
    
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-2xl bg-white border border-gray-100 rounded-2xl p-8 shadow-xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Complete Profile</h1>
            <p className="text-gray-500 mt-2">Almost there! We need a few details to set up your workspace.</p>
          </div>

          {authError && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-6 text-sm font-medium">{authError}</div>}

          <form onSubmit={handleCompleteRegistration} className="space-y-6">
            
            <div className="bg-gray-50 p-5 rounded-xl border border-gray-100">
              <label className="text-xs font-semibold text-[#22c55e] uppercase tracking-wider">I am registering as a...</label>
              <select className="w-full border border-gray-200 rounded-lg p-3 mt-2 bg-white cursor-pointer text-gray-900 font-medium focus:ring-2 focus:ring-[#22c55e]/20 outline-none" value={profileForm.role} onChange={e => setProfileForm({...profileForm, role: e.target.value})}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{isSelectedPro ? "Full Name / Firm Name" : "Full Name"}</label>
                <input type="text" required className="w-full border border-gray-200 rounded-lg p-3 mt-1 text-gray-900 outline-none" value={profileForm.name} onChange={e => setProfileForm({...profileForm, name: e.target.value})} />
              </div>
              
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Phone Number</label>
                <input type="tel" required placeholder="+91" className="w-full border border-gray-200 rounded-lg p-3 mt-1 text-gray-900 outline-none" value={profileForm.phone} onChange={e => setProfileForm({...profileForm, phone: e.target.value})} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Gender</label>
                <select className="w-full border border-gray-200 rounded-lg p-3 mt-1 bg-white cursor-pointer text-gray-900 outline-none" value={profileForm.gender} onChange={e => setProfileForm({...profileForm, gender: e.target.value})}>
                  {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider block mb-2">Profile Avatar</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-gray-50 border border-gray-200 rounded-full flex items-center justify-center overflow-hidden shrink-0">
                    {profileForm.avatar.length > 5 ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={profileForm.avatar} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl">{profileForm.avatar}</span>
                    )}
                  </div>
                  
                  <div className="flex-grow">
                    <div className="flex gap-2 mb-2">
                      {PRESET_AVATARS.map(preset => (
                        <button key={preset} type="button" onClick={() => setProfileForm({...profileForm, avatar: preset})} className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-full hover:bg-gray-50 transition-colors">
                          {preset}
                        </button>
                      ))}
                    </div>
                    <label className="bg-white text-gray-700 px-4 py-1.5 rounded-lg text-sm font-medium cursor-pointer border border-gray-200 hover:bg-gray-50 transition-colors inline-block shadow-sm">
                      Upload Photo
                      <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <button type="submit" className="w-full bg-[#22c55e] text-white rounded-xl p-4 font-semibold text-lg hover:bg-[#1ea950] transition-colors shadow-md mt-8">
              Complete Registration
            </button>
          </form>
        </div>
      </main>
    );
  }

  const isProRole = userData?.role && PRO_ROLES.includes(userData.role);
  const isPremium = userData?.tier === "premium";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 h-20 flex justify-between items-center bg-white relative z-50">
          
          <Link href="/" className="flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-8 h-8 md:w-10 md:h-10">
              <path d="M 50 15 A 35 35 0 1 0 85 50" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" className="text-gray-900" />
              <path d="M 50 15 L 85 15 L 85 50" fill="none" stroke="#22c55e" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-extrabold text-xl md:text-2xl tracking-tight text-gray-900">
              OKI<span className="text-[#22c55e]">CONSTRUCT</span>
            </span>
          </Link>

          <button 
            className="flex items-center gap-2 text-gray-900 hover:text-[#22c55e] transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <span className="text-sm font-semibold uppercase tracking-wider hidden md:inline-block">Menu</span>
            <span className="text-2xl leading-none">{isMobileMenuOpen ? "✕" : "☰"}</span>
          </button>
        </div>

        {isMobileMenuOpen && (
          <nav className="absolute top-full left-0 w-full bg-white border-b border-gray-100 flex flex-col p-6 gap-2 shadow-lg z-40 rounded-b-2xl">
            <div className="max-w-[1400px] mx-auto w-full flex flex-col gap-2">
              <Link href="/estimate-boq" className="font-medium text-gray-700 hover:text-[#22c55e] hover:bg-gray-50 p-2 rounded-lg transition-colors">Estimate BOQ</Link>
              <Link href="/track-expenditure" className="font-medium text-gray-700 hover:text-[#22c55e] hover:bg-gray-50 p-2 rounded-lg transition-colors">Track Expenditure</Link>
              <Link href="/contact-experts" className="font-medium text-gray-700 hover:text-[#22c55e] hover:bg-gray-50 p-2 rounded-lg transition-colors">Contact Experts</Link>
              
              {isPremium && (
                <Link href="/custom-settings" className="font-medium text-[#22c55e] hover:bg-green-50 p-2 rounded-lg transition-colors">
                  ⚙️ Custom Rates
                </Link>
              )}
              
              <Link href="/profile" className="font-medium text-gray-700 hover:text-[#22c55e] hover:bg-gray-50 p-2 rounded-lg transition-colors">My Profile</Link>
              
              <button onClick={handleLogout} className="font-semibold text-white bg-gray-900 rounded-xl px-4 py-2 mt-2 hover:bg-gray-800 transition-colors w-fit">
                Logout
              </button>
            </div>
          </nav>
        )}
      </header>

      {isProRole && !isPremium && (
        <div className="bg-[#22c55e]/10 text-[#15803d] rounded-xl p-3 text-center mx-4 md:mx-6 mt-6 border border-[#22c55e]/20">
          <p className="font-medium text-sm">
            Unlock custom material rates, billable client invoices, and directory visibility. 
            <Link href="/upgrade" className="underline font-bold ml-2 hover:text-[#22c55e]">Upgrade to Premium</Link>
          </p>
        </div>
      )}

      <main className="max-w-[1400px] mx-auto p-4 md:p-6 mt-8 flex-grow w-full">
        
        <div className="mb-12 flex items-center gap-6">
          <div className="w-20 h-20 bg-white border border-gray-200 shadow-sm rounded-full flex items-center justify-center overflow-hidden shrink-0">
            {userData?.avatar?.length > 5 ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={userData?.avatar} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl">{userData?.avatar || "👤"}</span>
            )}
          </div>
          
          <div className="flex flex-col justify-center">
            {/* 4-Second Dynamic Greeting */}
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight transition-all duration-700">
              {showWelcome ? `Welcome, ${userData?.name || 'User'}` : userData?.name || 'User'}
            </h1>
            
            <div className="flex items-center gap-3 mt-2">
              <p className="text-base text-gray-500 font-medium">
                {userData?.role} Account
              </p>
              {isPremium ? 
                <span className="bg-[#22c55e] text-white px-2.5 py-0.5 rounded-full text-xs font-bold shadow-sm">Premium</span> : 
                <span className="bg-gray-200 text-gray-600 px-2.5 py-0.5 rounded-full text-xs font-semibold">Standard</span>
              }
            </div>
          </div>
        </div>

        <div className="w-full h-[250px] md:h-[300px] bg-gray-900 rounded-3xl mb-12 flex items-center justify-center relative overflow-hidden group shadow-lg">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-800 to-gray-900 opacity-90 transition-opacity"></div>
          <div className="relative z-10 text-center text-white p-8">
            <span className="text-[#22c55e] font-bold text-xs uppercase tracking-[0.2em] mb-4 block">Sponsored Insight</span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Elevate Your Next Project</h2>
            <p className="text-gray-300 font-medium max-w-2xl mx-auto text-sm md:text-base">Discover premium building materials and exclusive partner deals tailored for your architectural needs.</p>
          </div>
        </div>

        <h3 className="font-bold text-xl text-gray-900 mb-6">Platform Tools</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Active: Generate 2D Layout */}
          <Link href="/generate-2d-layout" className="bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all group relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none transition-all group-hover:bg-purple-500/30"></div>
            <div className="w-14 h-14 bg-purple-500/20 text-purple-400 rounded-xl flex items-center justify-center mb-6 relative z-10">
              <span className="text-2xl">📐</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2 relative z-10">Generate 2D Layout</h2>
            <p className="text-gray-400 text-sm font-medium leading-relaxed relative z-10 flex-grow">
              Provide your plot dimensions and facing direction to auto-generate 3 distinct architectural floor plan concepts instantly.
            </p>
          </Link>
          
          {/* Estimate BOQ */}
          <Link href="/estimate-boq" className="bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all group relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#22c55e]/20 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none transition-all group-hover:bg-[#22c55e]/30"></div>
            <div className="w-14 h-14 bg-[#22c55e]/20 text-[#22c55e] rounded-xl flex items-center justify-center mb-6 relative z-10">
              <span className="text-2xl">🏗️</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2 relative z-10">Estimate BOQ</h2>
            <p className="text-gray-400 text-sm font-medium leading-relaxed relative z-10 flex-grow">
              Generate comprehensive material and labor estimates instantly based on your architectural parameters.
            </p>
          </Link>

          {/* Track Expenditure */}
          <Link href="/track-expenditure" className="bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all group relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none transition-all group-hover:bg-blue-500/30"></div>
            <div className="w-14 h-14 bg-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center mb-6 relative z-10">
              <span className="text-2xl">📊</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2 relative z-10">Track Expenditure</h2>
            <p className="text-gray-400 text-sm font-medium leading-relaxed relative z-10 flex-grow">
              Add expenditure records, monitor material consumption, and ensure your project stays strictly under budget.
            </p>
          </Link>

          {/* Contact Experts */}
          <Link href="/contact-experts" className="bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all group relative overflow-hidden flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/20 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none transition-all group-hover:bg-orange-500/30"></div>
            <div className="w-14 h-14 bg-orange-500/20 text-orange-400 rounded-xl flex items-center justify-center mb-6 relative z-10">
              <span className="text-2xl">🤝</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2 relative z-10">Contact Experts</h2>
            <p className="text-gray-400 text-sm font-medium leading-relaxed relative z-10 flex-grow">
              Browse our directory of top-rated Architects, Engineers, and Builders to consult or hire for your next project.
            </p>
          </Link>

        </div>
      </main>
    </div>
  );
}