"use client";
import React from 'react';
import Navbar from '../components/Navbar';
import Link from 'next/link';

export default function FAQ() {
  const faqs = [
    {
      question: "What exactly does OkiConstruct do?",
      answer: "OkiConstruct is a dual-purpose platform. First, our BOQ Estimator takes your building dimensions and local material rates to instantly generate a comprehensive material and labor cost breakdown. Second, our Expense Tracker allows you to log daily site purchases, compare them against your budget, and generate client-ready ledgers."
    },
    {
      question: "Are the BOQ material estimates 100% accurate?",
      answer: "Our engine uses advanced structural formulas (including dynamic slab overhangs, precise column heights, and standard wastage percentages) to provide highly accurate estimates. However, real-world construction varies based on site conditions, labor efficiency, and material brands. OkiConstruct is a powerful planning tool, but estimates should always be verified by your on-site engineer."
    },
    {
      question: "What is the difference between the Free and Premium (Pro) tiers?",
      answer: "Free users have access to our core estimation engine, basic expense tracking, and the ability to generate PDFs with their own custom logo. Premium users unlock the 'Pro Engine' (allowing custom structural ratios and wastage percentages), and advanced Client Billing features that calculate separate 'Actual' vs. 'Billable' rates to track profit margins seamlessly."
    },
    {
      question: "Is my project data secure?",
      answer: "Yes. We use Google's Firebase cloud infrastructure to securely store your layouts, rates, and ledgers. Your data is tied exclusively to your authenticated account."
    },
    {
      question: "Can I download my reports to share with clients?",
      answer: "Absolutely! Both the BOQ Estimator and the Project Ledger feature one-click PDF generation, perfectly formatted for printing or emailing to clients."
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <Navbar />

      <main className="max-w-4xl mx-auto p-4 md:p-8 mt-8 w-full flex-grow animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        <div className="bg-white border border-gray-100 rounded-3xl p-8 md:p-12 shadow-sm relative overflow-hidden">
          
          {/* Decorative Top Border */}
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#22c55e] to-[#16a34a]"></div>

          <div className="text-center mb-12">
            <div className="w-20 h-20 bg-green-50 text-[#22c55e] rounded-2xl flex items-center justify-center mx-auto mb-6 text-4xl shadow-sm">
              💬
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight mb-4">
              Frequently Asked Questions
            </h1>
            <p className="text-lg font-medium text-gray-500">
              Everything you need to know about the OkiConstruct platform.
            </p>
          </div>

          <div className="space-y-6">
            {faqs.map((faq, index) => (
              <div key={index} className="bg-gray-50 border border-gray-100 p-6 rounded-2xl shadow-sm hover:border-[#22c55e]/30 transition-colors">
                <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-start gap-3">
                  <span className="text-[#22c55e] text-2xl leading-none">Q.</span>
                  {faq.question}
                </h3>
                <p className="text-gray-600 font-medium leading-relaxed pl-8">
                  <strong className="text-gray-900 font-bold mr-1">A.</strong>
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>

          {/* Back Navigation */}
          <div className="mt-12 text-center">
            <Link href="/" className="inline-flex items-center gap-2 font-bold text-gray-500 hover:text-gray-900 transition-colors bg-white px-6 py-3 rounded-xl border border-gray-200 hover:border-gray-300 shadow-sm">
              ⬅ Back to Home
            </Link>
          </div>

        </div>
      </main>
    </div>
  );
}