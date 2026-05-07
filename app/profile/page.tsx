"use client";
import React, { useState, useEffect } from 'react';
import { auth, db } from "../lib/firebase";
import Navbar from "../components/Navbar";
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<Record<string, any> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Workspace Navigation State
  const [activeTab, setActiveTab] = useState<'overview' | 'boqs' | 'ledgers'>('overview');
  
  // Database States
  const [savedBOQs, setSavedBOQs] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  
  // NEW: State to hold the actively opened BOQ document
  const [selectedBOQ, setSelectedBOQ] = useState<any>(null);

  // Message Center State
  const [isMessageCenterOpen, setIsMessageCenterOpen] = useState(false);
  const mockMessages = [
    { id: 1, sender: "Rahul Sharma", role: "Homeowner", avatar: "👨‍💼", preview: "Hi! I saw your profile and need a quote for a 3BHK construction...", time: "2 hours ago", unread: true },
    { id: 2, sender: "Priya Patel", role: "Architect", avatar: "👩‍💼", preview: "The revised BOQ looks good. Let's proceed with the new cement rates.", time: "Yesterday", unread: false }
  ];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setUserData(docSnap.data());
        }
      } else {
        window.location.href = '/'; 
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch Saved BOQs from Firebase
  const fetchSavedBOQs = async () => {
    if (!user) return;
    setIsLoadingData(true);
    setActiveTab('boqs');
    setSelectedBOQ(null); // Always clear selection when returning to list
    try {
      const q = query(collection(db, "boq_projects"), where("uid", "==", user.uid));
      const querySnapshot = await getDocs(q);
      const fetchedBOQs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Sort by newest first
      fetchedBOQs.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setSavedBOQs(fetchedBOQs);
    } catch (error) {
      console.error("Error fetching BOQs:", error);
    } finally {
      setIsLoadingData(false);
    }
  };

  // Switch to Ledgers Tab 
  const openLedgers = () => {
    setActiveTab('ledgers');
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center font-medium text-gray-500">Loading Profile...</div>;
  if (!user || !userData) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <Navbar />

      <main className="max-w-[1000px] mx-auto p-4 md:p-6 mt-8 flex-grow w-full">
        
        {/* --- HEADER & PROFILE CARD --- */}
        <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-sm relative mb-8 print:hidden">
          
          <div className="absolute top-6 right-6 flex items-center gap-4">
            <button 
              onClick={() => setIsMessageCenterOpen(true)}
              className="relative p-2 text-gray-400 hover:text-[#22c55e] transition-colors bg-gray-50 hover:bg-green-50 rounded-full shadow-sm"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
              </svg>
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full"></span>
            </button>
            <button className="text-sm font-semibold text-gray-500 hover:text-gray-900 px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors hidden md:block">
              Edit Profile
            </button>
          </div>

          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <div className="w-24 h-24 bg-gray-50 border border-gray-200 rounded-full flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
              {userData.avatar?.length > 5 ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={userData.avatar} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl">{userData.avatar || "👤"}</span>
              )}
            </div>
            
            <div className="text-center md:text-left mt-2">
              <h1 className="text-2xl font-bold text-gray-900">{userData.name}</h1>
              <p className="text-gray-500 font-medium">{userData.email}</p>
              
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mt-4">
                <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-lg text-xs font-semibold">{userData.role}</span>
                {userData.tier === "premium" && (
                  <span className="bg-[#22c55e]/10 text-[#15803d] px-3 py-1 rounded-lg text-xs font-bold border border-[#22c55e]/20">Premium Pro</span>
                )}
                <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1">
                  📞 {userData.phone}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* --- DYNAMIC WORKSPACE CONTROLS --- */}
        <div className="flex items-center justify-between mb-4 px-2 print:hidden">
          <h2 className="text-xl font-bold text-gray-900">Project Workspace</h2>
          {activeTab !== 'overview' && !selectedBOQ && (
            <button 
              onClick={() => setActiveTab('overview')} 
              className="text-sm font-bold text-gray-500 hover:text-gray-900 flex items-center gap-2 transition-colors"
            >
              ⬅ Back to Overview
            </button>
          )}
        </div>
        
        {/* VIEW: OVERVIEW (Stats) */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 animate-in fade-in duration-300">
            <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-6">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">🏗️</span>
                </div>
                <button onClick={fetchSavedBOQs} className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors">View All ➔</button>
              </div>
              <h3 className="text-gray-500 font-semibold text-sm uppercase tracking-wider mb-1">Estimate BOQs</h3>
              <div className="flex items-end gap-3">
                <span className="text-4xl font-bold text-gray-900">Active</span>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-500">
                Generate and manage comprehensive material estimates.
              </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-6">
                <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">📊</span>
                </div>
                <button onClick={openLedgers} className="text-sm font-semibold text-orange-600 hover:text-orange-800 transition-colors">Open Ledgers ➔</button>
              </div>
              <h3 className="text-gray-500 font-semibold text-sm uppercase tracking-wider mb-1">Expense Tracking</h3>
              <div className="flex items-end gap-3">
                <span className="text-4xl font-bold text-gray-900">Active</span>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-500">
                Track material purchases and daily site expenditures.
              </div>
            </div>
          </div>
        )}

        {/* VIEW: BOQ HUB (List or Details) */}
        {activeTab === 'boqs' && (
          <>
            {/* If a specific BOQ is NOT selected, show the Grid List */}
            {!selectedBOQ ? (
              <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm animate-in fade-in duration-300">
                <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                  <span className="text-2xl">🏗️</span> Your Saved BOQ Estimates
                </h3>
                
                {isLoadingData ? (
                  <p className="text-center text-gray-500 py-10 font-medium">Fetching your projects from the cloud...</p>
                ) : savedBOQs.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-gray-500 font-medium mb-4">You haven't saved any BOQ estimates yet.</p>
                    <a href="/estimate-boq" className="inline-block bg-gray-900 text-white font-semibold px-6 py-2 rounded-xl hover:bg-[#22c55e] transition-colors">Create New BOQ</a>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {savedBOQs.map((boq) => (
                      <div 
                        key={boq.id} 
                        onClick={() => setSelectedBOQ(boq)} // NEW: Opens the detailed report
                        className="border border-gray-200 rounded-2xl p-5 hover:border-[#22c55e] transition-all group cursor-pointer shadow-sm hover:shadow-md hover:-translate-y-1 bg-white"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h4 className="font-bold text-gray-900 text-lg group-hover:text-[#22c55e] transition-colors">{boq.projectName}</h4>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mt-1">
                              {new Date(boq.createdAt?.seconds * 1000).toLocaleDateString()}
                            </p>
                          </div>
                          <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-lg text-xs font-bold">
                            G+{boq.totalFloors - 1} Structure
                          </span>
                        </div>
                        <div className="flex justify-between items-end border-t border-gray-100 pt-4 mt-4">
                          <span className="text-sm font-medium text-gray-500">Estimated Cost</span>
                          <span className="text-xl font-black text-gray-900">₹{boq.grandTotal?.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              
              /* NEW: DETAILED BOQ SHEET VIEW */
              <div className="animate-in fade-in duration-300 printable-boq">
                <button 
                  onClick={() => setSelectedBOQ(null)} 
                  className="mb-6 text-sm font-bold text-gray-500 hover:text-gray-900 flex items-center gap-2 transition-colors print:hidden bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm"
                >
                  ⬅ Back to Project List
                </button>

                <div className="bg-white border border-gray-100 rounded-3xl p-6 md:p-10 shadow-lg print:shadow-none print:border-none print:p-0">
                  
                  {/* Detailed Header */}
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b border-gray-100 pb-6 print:border-b-2">
                    <div>
                      <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{selectedBOQ.projectName}</h1>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-sm font-bold text-gray-500 uppercase tracking-widest">
                          OkiConstruct Master BOQ
                        </span>
                        <span className="text-gray-300">•</span>
                        <span className="text-sm font-medium text-gray-500">
                          {new Date(selectedBOQ.createdAt?.seconds * 1000).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <button 
                      onClick={() => window.print()} 
                      className="mt-4 md:mt-0 bg-gray-900 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-[#22c55e] transition-colors shadow-md print:hidden flex items-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                      Download PDF
                    </button>
                  </div>

                  {/* Sectional Data Mapping */}
                  {selectedBOQ.boqData?.floorReports?.map((floor: any, fIdx: number) => (
                    <div key={fIdx} className="space-y-6 print:break-inside-avoid print:mb-8 mb-10">
                      <h2 className="text-lg font-bold text-[#15803d] bg-[#22c55e]/10 inline-block px-4 py-2 rounded-xl border border-[#22c55e]/20 print:border-none print:px-0 print:bg-transparent print:text-black print:text-xl">
                        {floor.floorName}
                      </h2>
                      
                      {floor.sections?.map((section: any, idx: number) => (
                        <div key={idx} className="border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-sm print:border-b print:rounded-none print:shadow-none print:mb-4">
                          
                          <div className="bg-gray-50 p-4 border-b border-gray-100 print:bg-gray-100 print:p-2">
                            <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider">{section.title}</h3>
                          </div>
                          
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[600px] print:min-w-full print:text-sm">
                              <thead>
                                <tr className="border-b border-gray-100 print:border-gray-300">
                                  <th className="p-4 font-semibold text-xs text-gray-500 uppercase tracking-wider print:p-2">Material/Service</th>
                                  <th className="p-4 font-semibold text-xs text-gray-500 uppercase tracking-wider text-center print:p-2">Unit</th>
                                  <th className="p-4 font-semibold text-xs text-gray-500 uppercase tracking-wider text-center print:p-2">Qty</th>
                                  <th className="p-4 font-semibold text-xs text-gray-500 uppercase tracking-wider text-right print:p-2">Rate</th>
                                  <th className="p-4 font-semibold text-xs text-gray-500 uppercase tracking-wider text-right print:p-2">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {section.items?.map((item: any, i: number) => (
                                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors print:border-gray-200">
                                    <td className="p-4 font-semibold text-sm text-gray-900 print:p-2">{item.name}</td>
                                    <td className="p-4 text-center font-medium text-sm text-gray-500 print:p-2">{item.unit}</td>
                                    <td className="p-4 text-center font-bold text-sm text-[#22c55e] print:p-2 print:text-black">{item.qty || 0}</td>
                                    <td className="p-4 text-right font-medium text-sm text-gray-600 print:p-2">₹{item.rate || 0}</td>
                                    <td className="p-4 text-right font-bold text-sm text-gray-900 print:p-2">₹{Math.ceil((item.qty || 0) * (item.rate || 0)).toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-gray-50/50 print:bg-transparent">
                                  <td colSpan={4} className="p-4 font-semibold text-xs text-gray-500 uppercase tracking-wider text-right print:p-2">Section Subtotal:</td>
                                  <td className="p-4 font-bold text-base text-gray-900 text-right print:p-2">₹{section.sectionTotal.toLocaleString()}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                  
                  {/* Grand Total Block */}
                  <div className="bg-gray-900 text-white p-8 rounded-2xl text-center shadow-lg mt-12 print:shadow-none print:bg-white print:text-black print:border-2 print:border-black print:break-inside-avoid">
                    <p className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-2 print:text-gray-600">Total Project Estimate</p>
                    <h2 className="text-5xl md:text-6xl font-black text-[#22c55e] print:text-black">
                      ₹ {Math.ceil(selectedBOQ.boqData?.grandTotal || 0).toLocaleString()}
                    </h2>
                  </div>

                </div>
              </div>
            )}
          </>
        )}

        {/* VIEW: SAVED LEDGERS LIST */}
        {activeTab === 'ledgers' && (
          <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm animate-in fade-in duration-300">
             <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
              <span className="text-2xl">📊</span> Your Expense Ledgers
            </h3>
            <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50">
                <p className="text-gray-500 font-medium mb-4">Connect this to your Expense Tracking database.</p>
                <a href="/track-expenditure" className="inline-block bg-gray-900 text-white font-semibold px-6 py-2 rounded-xl hover:bg-orange-500 transition-colors">Start Tracking Expenses</a>
            </div>
          </div>
        )}

      </main>

      {/* --- MESSAGE CENTER MODAL (OVERLAY) --- */}
      {isMessageCenterOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/20 backdrop-blur-sm print:hidden">
          <div className="w-full md:w-[450px] bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Messages</h2>
                <p className="text-sm font-medium text-gray-500">Inquiries and project requests</p>
              </div>
              <button onClick={() => setIsMessageCenterOpen(false)} className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors">✕</button>
            </div>
            <div className="flex-grow overflow-y-auto p-4 space-y-2 bg-gray-50">
              {mockMessages.map((msg) => (
                <div key={msg.id} className={`p-4 rounded-2xl cursor-pointer transition-colors border ${msg.unread ? 'bg-white border-[#22c55e]/30 shadow-sm' : 'bg-white border-transparent hover:border-gray-200'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{msg.avatar}</span>
                      <div>
                        <h4 className="font-bold text-sm text-gray-900">{msg.sender}</h4>
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{msg.role}</span>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-gray-400">{msg.time}</span>
                  </div>
                  <p className={`text-sm ${msg.unread ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>{msg.preview}</p>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-100 bg-white text-center">
              <p className="text-xs font-medium text-gray-400">End of messages</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}