"use client";
import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// THE 7 CORE ROLES
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
  
  // --- CORE STATE ---
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // --- AUTH & ONBOARDING STATE ---
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

  // --- INITIALIZATION ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Check if they have a completed profile in the database
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setUserData(docSnap.data());
          setIsOnboarding(false);
        } else {
          // If no profile exists, trap them in the onboarding screen!
          setProfileForm(prev => ({
            ...prev,
            name: currentUser.displayName || "", // Pre-fill name from Google if available
          }));
          setIsOnboarding(true);
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

  // --- STEP 1: AUTHENTICATION HANDLERS ---
  const handleAuth = async (e: any) => {
    e.preventDefault();
    setAuthError("");
    setIsLoading(true);

    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
        // We DO NOT create the Firestore doc here anymore. onAuthStateChanged will trigger onboarding.
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      console.error("Auth Error:", error);
      setAuthError(error.message || "Authentication failed. Please check your credentials.");
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setAuthError("");
    setIsLoading(true);
    const provider = new GoogleAuthProvider();

    try {
      await signInWithPopup(auth, provider);
      // onAuthStateChanged automatically takes over from here!
    } catch (error: any) {
      console.error("Google Auth Error:", error);
      setAuthError(error.message || "Google Sign-In failed.");
      setIsLoading(false);
    }
  };

  // --- STEP 2: ONBOARDING HANDLERS ---
  const handleAvatarUpload = (e: any) => {
    const file = e.target.files[0];
    if (!file) return;

    // Safely compress the image to Base64 so it doesn't crash the database
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
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleCompleteRegistration = async (e: any) => {
    e.preventDefault();
    setAuthError("");
    
    if (!profileForm.name.trim() || !profileForm.phone.trim()) {
      return setAuthError("Please fill in your Name and Phone Number.");
    }
    
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
      setIsOnboarding(false); // Unlocks the Dashboard!
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

  // --- UI: LOADING STATE ---
  if (isLoading) return <div className="min-h-screen flex items-center justify-center font-black text-2xl uppercase">Loading OkiConstruct...</div>;

  // --- UI STATE 1: UNAUTHENTICATED (LOGIN / REGISTER PORTAL) ---
  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="w-full max-w-md bg-white border-4 border-black p-8 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]">
          <h1 className="text-3xl font-black uppercase text-center mb-2">
            {isRegistering ? "Start Registration" : "Access Portal"}
          </h1>
          <p className="text-center font-bold text-gray-500 mb-8 text-sm uppercase tracking-widest">OKICONSTRUCT OPERATING SYSTEM</p>

          {authError && <div className="bg-red-100 border-l-4 border-red-600 text-red-600 p-3 mb-6 font-bold text-sm">{authError}</div>}

          {/* GOOGLE AUTH BUTTON (PRIMARY) */}
          <button onClick={handleGoogleAuth} type="button" className="w-full bg-white text-black border-4 border-black p-4 font-black uppercase flex items-center justify-center gap-3 hover:bg-gray-100 transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-y-1 mb-6">
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center justify-between mb-6">
            <hr className="w-full border-gray-300" />
            <span className="p-2 text-xs font-black uppercase text-gray-400 bg-white">OR MANUAL ENTRY</span>
            <hr className="w-full border-gray-300" />
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest">Email Address</label>
              <input type="email" required className="w-full border-2 border-black p-3 font-bold mt-1" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest">{isRegistering ? "Set Password" : "Password"}</label>
              <input type="password" required className="w-full border-2 border-black p-3 font-bold mt-1" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <button type="submit" className="w-full bg-[#22c55e] text-black border-4 border-black p-4 font-black uppercase text-xl hover:bg-black hover:text-[#22c55e] transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-y-1 mt-4">
              {isRegistering ? "Register Email" : "Secure Login"}
            </button>
          </form>

          <div className="mt-8 text-center border-t-2 border-gray-200 pt-6">
            <button onClick={() => {setIsRegistering(!isRegistering); setAuthError("");}} className="font-black text-sm uppercase text-gray-500 hover:text-black transition-colors">
              {isRegistering ? "Already have an account? Log In" : "Need an account? Register Here"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  // --- UI STATE 2: AUTHENTICATED BUT NEEDS ONBOARDING ---
  if (isOnboarding) {
    const isSelectedPro = PRO_ROLES.includes(profileForm.role);
    
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="w-full max-w-2xl bg-white border-4 border-black p-8 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]">
          <div className="border-b-8 border-[#22c55e] pb-4 mb-8">
            <h1 className="text-3xl md:text-4xl font-black uppercase text-black">Complete Profile</h1>
            <p className="font-bold text-gray-500 uppercase tracking-widest text-sm mt-2">Almost there! We need a few details to set up your workspace.</p>
          </div>

          {authError && <div className="bg-red-100 border-l-4 border-red-600 text-red-600 p-3 mb-6 font-bold text-sm">{authError}</div>}

          <form onSubmit={handleCompleteRegistration} className="space-y-6">
            
            {/* ROLE */}
            <div className="bg-gray-50 p-4 border-2 border-dashed border-gray-300">
              <label className="text-xs font-black uppercase tracking-widest text-[#22c55e]">I am registering as a...</label>
              <select className="w-full border-2 border-black p-3 font-black mt-2 bg-white cursor-pointer text-lg" value={profileForm.role} onChange={e => setProfileForm({...profileForm, role: e.target.value})}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* NAME */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest">{isSelectedPro ? "Full Name / Firm Name" : "Full Name"}</label>
                <input type="text" required className="w-full border-2 border-black p-3 font-bold mt-1" value={profileForm.name} onChange={e => setProfileForm({...profileForm, name: e.target.value})} />
              </div>
              
              {/* PHONE */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest">Phone Number</label>
                <input type="tel" required placeholder="+91" className="w-full border-2 border-black p-3 font-bold mt-1" value={profileForm.phone} onChange={e => setProfileForm({...profileForm, phone: e.target.value})} />
              </div>
            </div>

            {/* GENDER & AVATAR */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest">Gender</label>
                <select className="w-full border-2 border-black p-3 font-bold mt-1 bg-white cursor-pointer" value={profileForm.gender} onChange={e => setProfileForm({...profileForm, gender: e.target.value})}>
                  {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest block mb-1">Profile Avatar</label>
                <div className="flex items-center gap-4">
                  {/* Avatar Display Box */}
                  <div className="w-16 h-16 bg-gray-100 border-4 border-black flex items-center justify-center overflow-hidden shrink-0">
                    {profileForm.avatar.length > 5 ? (
                      <img src={profileForm.avatar} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl">{profileForm.avatar}</span>
                    )}
                  </div>
                  
                  <div className="flex-grow">
                    {/* Preset Emojis */}
                    <div className="flex gap-2 mb-2">
                      {PRESET_AVATARS.map(preset => (
                        <button key={preset} type="button" onClick={() => setProfileForm({...profileForm, avatar: preset})} className="w-8 h-8 flex items-center justify-center border-2 border-black hover:bg-gray-200 transition-colors">
                          {preset}
                        </button>
                      ))}
                    </div>
                    {/* File Upload */}
                    <label className="bg-black text-white px-3 py-1 text-xs font-black uppercase cursor-pointer hover:bg-[#22c55e] hover:text-black transition-colors border-2 border-black inline-block">
                      Upload Photo
                      <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <button type="submit" className="w-full bg-[#22c55e] text-black border-4 border-black p-4 font-black uppercase text-xl hover:bg-black hover:text-[#22c55e] transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-y-1 mt-8">
              Complete Registration ➔
            </button>
          </form>
        </div>
      </main>
    );
  }

  // --- UI STATE 3: MASTER DASHBOARD (LOGGED IN & COMPLETED) ---
  const isProRole = userData?.role && PRO_ROLES.includes(userData.role);
  const isPremium = userData?.tier === "premium";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      
      {/* 1. MASTER HEADER */}
      <header className="bg-black text-white border-b-4 border-black sticky top-0 z-50">
        {/* Header Bar */}
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 h-20 flex justify-between items-center bg-black relative z-50">
          
          {/* Logo */}
          <Link href="/dashboard" className="font-black text-2xl tracking-tighter cursor-pointer hover:opacity-80 transition-opacity">
            <span className="text-white">OKI</span><span className="text-[#22c55e]">CONSTRUCT</span>
          </Link>

          {/* Universal Menu Button (Visible on ALL screens) */}
          <button 
            className="flex items-center gap-2 text-white font-black text-xl hover:text-[#22c55e] transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <span className="text-sm tracking-widest uppercase hidden md:inline-block">Menu</span>
            <span className="text-2xl">{isMobileMenuOpen ? "✕" : "☰"}</span>
          </button>
        </div>

        {/* Universal Dropdown Drawer */}
        {isMobileMenuOpen && (
          <nav className="absolute top-full left-0 w-full bg-gray-900 border-b-4 border-black flex flex-col p-6 gap-4 animate-in slide-in-from-top-2 shadow-[0px_10px_0px_0px_rgba(0,0,0,1)] z-40">
            <div className="max-w-[1400px] mx-auto w-full flex flex-col gap-4">
              <Link href="/estimate-boq" className="font-black text-sm md:text-base uppercase hover:text-[#22c55e] border-b border-gray-800 pb-3 transition-colors">Estimate BOQ</Link>
              <Link href="/track-expenditure" className="font-black text-sm md:text-base uppercase hover:text-[#22c55e] border-b border-gray-800 pb-3 transition-colors">Track Expenditure</Link>
              <Link href="/contact-experts" className="font-black text-sm md:text-base uppercase hover:text-[#22c55e] border-b border-gray-800 pb-3 transition-colors">Contact Experts</Link>
              
              {isPremium && (
                <Link href="/custom-settings" className="font-black text-sm md:text-base uppercase text-[#22c55e] border-b border-gray-800 pb-3 hover:text-white transition-colors">
                  ⚙️ Custom Rates
                </Link>
              )}
              
              <Link href="/profile" className="font-black text-sm md:text-base uppercase text-gray-300 hover:text-white border-b border-gray-800 pb-3 transition-colors">My Profile</Link>
              
              <button onClick={handleLogout} className="font-black text-sm md:text-base uppercase text-red-500 text-left pt-2 hover:text-white transition-colors w-fit">
                Logout ➔
              </button>
            </div>
          </nav>
        )}
      </header>

      {/* 2. THE PRO UPSELL BANNER */}
      {isProRole && !isPremium && (
        <div className="bg-[#22c55e] text-black border-b-4 border-black p-3 text-center">
          <p className="font-black text-sm uppercase">
            Unlock custom material rates, billable client invoices, and directory visibility. 
            <a href="/upgrade" className="underline ml-2 hover:text-white">Upgrade to Premium ➔</a>
          </p>
        </div>
      )}

      {/* 3. MAIN CONTENT */}
      <main className="max-w-[1400px] mx-auto p-4 md:p-6 mt-6 flex-grow w-full">
        
        <div className="mb-8 flex items-center gap-6 border-l-8 border-black pl-6 py-2">
          {/* Dashboard Profile Avatar */}
          <div className="w-20 h-20 bg-gray-200 border-4 border-black flex items-center justify-center overflow-hidden shrink-0">
            {userData?.avatar?.length > 5 ? (
              <img src={userData.avatar} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl">{userData?.avatar || "👤"}</span>
            )}
          </div>
          
          <div>
            <h1 className="text-4xl md:text-5xl font-black uppercase">Welcome Back, {userData?.name || 'User'}</h1>
            <p className="text-lg font-bold text-gray-500 uppercase tracking-widest mt-2">
              {userData?.role} Account {isPremium ? <span className="text-[#22c55e] bg-black px-2 py-1 text-xs ml-2">PREMIUM TIER</span> : <span className="text-gray-400 bg-gray-200 px-2 py-1 text-xs ml-2">STANDARD TIER</span>}
            </p>
          </div>
        </div>

        <div className="w-full h-[250px] md:h-[350px] bg-gray-200 border-4 border-black mb-12 flex items-center justify-center relative overflow-hidden group cursor-pointer">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-900 to-gray-800 opacity-90 group-hover:opacity-100 transition-opacity"></div>
          <div className="relative z-10 text-center text-white p-6">
            <span className="text-[#22c55e] font-black text-xs uppercase tracking-[0.3em] mb-4 block">Sponsored Content</span>
            <h2 className="text-3xl md:text-5xl font-black uppercase mb-4">Your Advertisement Here</h2>
            <p className="text-gray-300 font-bold max-w-2xl mx-auto">This hero space is completely controlled by the admin. Use it to promote new building materials, partner brands, or premium software features.</p>
          </div>
        </div>

        <h3 className="font-black text-2xl uppercase mb-6 border-b-4 border-black pb-2 inline-block">Platform Tools</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          <Link href="/estimate-boq" className="bg-white border-4 border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-y-2 hover:translate-x-2 transition-all group">
            <div className="w-16 h-16 bg-[#22c55e] border-4 border-black flex items-center justify-center mb-6 group-hover:bg-black transition-colors">
              <span className="text-3xl">🏗️</span>
            </div>
            <h2 className="text-2xl font-black uppercase mb-3">Estimate BOQ</h2>
            <p className="font-bold text-gray-600 text-sm">Generate comprehensive material and labor estimates instantly based on your architectural parameters.</p>
          </Link>

          <Link href="/track-expenditure" className="bg-white border-4 border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-y-2 hover:translate-x-2 transition-all group">
            <div className="w-16 h-16 bg-[#22c55e] border-4 border-black flex items-center justify-center mb-6 group-hover:bg-black transition-colors">
              <span className="text-3xl">📊</span>
            </div>
            <h2 className="text-2xl font-black uppercase mb-3">Track Expenditure</h2>
            <p className="font-bold text-gray-600 text-sm">Log daily purchases, monitor material consumption, and ensure your project stays strictly under budget.</p>
          </Link>

          <Link href="/contact-experts" className="bg-white border-4 border-black p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-y-2 hover:translate-x-2 transition-all group">
            <div className="w-16 h-16 bg-[#22c55e] border-4 border-black flex items-center justify-center mb-6 group-hover:bg-black transition-colors">
              <span className="text-3xl">🤝</span>
            </div>
            <h2 className="text-2xl font-black uppercase mb-3">Contact Experts</h2>
            <p className="font-bold text-gray-600 text-sm">Browse our directory of top-rated Architects, Engineers, and Builders to consult or hire for your next project.</p>
          </Link>

        </div>
      </main>

      {/* 4. MASTER FOOTER */}
      <footer className="bg-black text-white border-t-8 border-[#22c55e] py-12 mt-20">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          
          <div className="font-black text-2xl tracking-tighter">
            <span className="text-white">OKI</span><span className="text-[#22c55e]">CONSTRUCT</span>
          </div>

          <nav className="flex flex-wrap justify-center gap-6 md:gap-10 font-black text-xs uppercase tracking-widest text-gray-400">
            <Link href="/terms" className="hover:text-white transition-colors">Terms & Conditions</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/about" className="hover:text-white transition-colors">About Us</Link>
            <Link href="/faq" className="hover:text-white transition-colors">FAQs</Link>
          </nav>

          <div className="text-gray-600 font-bold text-[10px] uppercase tracking-widest">
            © {new Date().getFullYear()} OkiConstruct. All rights reserved.
          </div>
          
        </div>
      </footer>
    </div>
  );
}