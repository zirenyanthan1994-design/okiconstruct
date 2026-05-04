"use client";
import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import Link from 'next/link';

export default function ContactUs() {
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app, tie this to a backend service like EmailJS or SendGrid.
    setIsSubmitted(true);
  };

  const inputStyle = "w-full border border-gray-200 bg-gray-50 rounded-xl p-4 text-gray-900 font-medium focus:bg-white focus:ring-2 focus:ring-[#22c55e]/30 focus:border-[#22c55e] transition-all outline-none";
  const labelStyle = "text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <Navbar />

      <main className="max-w-5xl mx-auto p-4 md:p-8 mt-8 w-full flex-grow animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        <div className="bg-white border border-gray-100 rounded-3xl p-8 md:p-12 shadow-sm relative overflow-hidden">
          
          {/* Decorative Top Border */}
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-gray-800 to-gray-600"></div>

          <div className="text-center mb-12">
            <div className="w-20 h-20 bg-gray-50 text-gray-700 rounded-2xl flex items-center justify-center mx-auto mb-6 text-4xl shadow-sm border border-gray-100">
              📬
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight mb-4">
              Contact Us
            </h1>
            <p className="text-lg font-medium text-gray-500">
              Have a question, feedback, or need basic support? We'd love to hear from you.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            
            {/* Direct Contact Info Cards */}
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Our Contact Details</h2>
              
              <a href="tel:9619067768" className="flex items-center gap-6 p-6 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-white hover:border-[#22c55e]/50 hover:shadow-md transition-all group">
                <div className="w-14 h-14 bg-white rounded-xl shadow-sm border border-gray-200 flex items-center justify-center text-2xl group-hover:bg-green-50 transition-colors">
                  📞
                </div>
                <div>
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-1">Call Support</span>
                  <span className="text-xl font-bold text-gray-900 group-hover:text-[#22c55e] transition-colors">9619067768</span>
                </div>
              </a>

              <a href="mailto:okiconstruct.contact@gmail.com" className="flex items-center gap-6 p-6 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-white hover:border-[#22c55e]/50 hover:shadow-md transition-all group">
                <div className="w-14 h-14 bg-white rounded-xl shadow-sm border border-gray-200 flex items-center justify-center text-2xl group-hover:bg-green-50 transition-colors">
                  ✉️
                </div>
                <div>
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-1">Email Support</span>
                  <span className="text-lg font-bold text-gray-900 group-hover:text-[#22c55e] transition-colors">okiconstruct.contact@gmail.com</span>
                </div>
              </a>

              <div className="bg-gray-50 border border-gray-200 p-8 rounded-2xl mt-8">
                <h3 className="text-lg font-bold mb-2 text-gray-900">Support Hours</h3>
                <p className="text-gray-500 font-medium">
                  Available Monday to Saturday<br/>
                  9:00 AM - 6:00 PM IST
                </p>
                <p className="text-xs text-gray-400 mt-4 italic">
                  *Pro users seeking urgent project assistance should use the "Contact Experts" portal.
                </p>
              </div>
            </div>

            {/* Support Form */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Drop a Message</h2>
              
              {isSubmitted ? (
                <div className="bg-green-50 border border-green-100 rounded-2xl p-10 text-center animate-in zoom-in duration-300">
                  <div className="text-5xl mb-4">✅</div>
                  <h3 className="text-2xl font-bold text-[#15803d] mb-2">Message Received!</h3>
                  <p className="text-[#166534] font-medium">
                    Thank you for reaching out. Our support team will review your message and get back to you soon.
                  </p>
                  <button 
                    onClick={() => setIsSubmitted(false)}
                    className="mt-6 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelStyle}>First Name</label>
                      <input type="text" required placeholder="John" className={inputStyle} />
                    </div>
                    <div>
                      <label className={labelStyle}>Last Name</label>
                      <input type="text" required placeholder="Doe" className={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <label className={labelStyle}>Email Address</label>
                    <input type="email" required placeholder="john@example.com" className={inputStyle} />
                  </div>
                  <div>
                    <label className={labelStyle}>Subject</label>
                    <div className="relative">
                      <select required className={`${inputStyle} appearance-none cursor-pointer`}>
                        <option value="" disabled selected>Select a topic...</option>
                        <option value="general">General Inquiry</option>
                        <option value="bug">Report a Bug / Issue</option>
                        <option value="feedback">Product Feedback</option>
                        <option value="billing">Billing Question</option>
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-sm">▼</div>
                    </div>
                  </div>
                  <div>
                    <label className={labelStyle}>Message</label>
                    <textarea 
                      required 
                      rows={4} 
                      placeholder="How can we help you today?" 
                      className={`${inputStyle} resize-none`} 
                    ></textarea>
                  </div>
                  <button type="submit" className="w-full bg-gray-900 text-white font-bold text-lg p-4 rounded-xl hover:bg-[#22c55e] transition-colors shadow-md flex items-center justify-center gap-2">
                    Send Message ➔
                  </button>
                </form>
              )}
            </div>

          </div>

          {/* Back Navigation */}
          <div className="mt-12 text-center pt-8 border-t border-gray-100">
            <Link href="/" className="inline-flex items-center gap-2 font-bold text-gray-500 hover:text-gray-900 transition-colors bg-gray-50 px-6 py-3 rounded-xl border border-gray-200 hover:border-gray-300">
              ⬅ Back to Home
            </Link>
          </div>

        </div>
      </main>
    </div>
  );
}