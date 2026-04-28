// modules/AnnouncementsModule.jsx
import { useState } from "react";
import {  Megaphone, Eye } from "lucide-react";

const dummyAnnouncements = [
  {
    id: 1,
    title: "Mid-Term Report Cards Ready",
    message: "All Form 3 and Form 4 mid-term report cards are now ready for collection. Parents are requested to come to school on Thursday, 23rd April 2026 between 08:00 and 12:00.",
    date: "2026-04-15",
    type: "Academic",
    audience: "All Parents",
    postedBy: "Dr. Jane Mphande",
    priority: "High",
    readCount: 142,
  },
  {
    id: 2,
    title: "Boarding Students - Evening Study Schedule Change",
    message: "Due to upcoming MSCE mock examinations, evening prep will now run from 19:30 to 21:30 instead of 19:00 to 21:00 starting next week.",
    date: "2026-04-14",
    type: "Boarding",
    audience: "Boarding Students & Parents",
    postedBy: "Mr. Martin Khumbata",
    priority: "Medium",
    readCount: 89,
  },
  {
    id: 3,
    title: "Fee Reminder - Term 2 Fees",
    message: "Parents with outstanding balances are kindly reminded to clear fees by 30th April 2026 to avoid penalties.",
    date: "2026-04-12",
    type: "Finance",
    audience: "Parents with Arrears",
    postedBy: "Bursar - Mrs. Edith Mwale",
    priority: "High",
    readCount: 67,
  },
  {
    id: 4,
    title: "School Sports Day",
    message: "The annual inter-house sports competition will be held on Friday, 8th May 2026. All students are encouraged to participate.",
    date: "2026-04-10",
    type: "Events",
    audience: "All Students & Parents",
    postedBy: "Mr. Kelvin Mwase",
    priority: "Medium",
    readCount: 203,
  },
];

export default function AnnouncementsModule() {
  const [announcements] = useState(dummyAnnouncements);
  const [filterType, setFilterType] = useState("All");
  const [showCompose, setShowCompose] = useState(false);

  const filteredAnnouncements = announcements.filter(a => 
    filterType === "All" || a.type === filterType
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-[#0F2044]" style={{ fontFamily: "'Playfair Display', serif" }}>
            Announcements & Notifications
          </h2>
          <p className="text-[#0F2044]/60">Communicate with parents, students and staff</p>
        </div>

        <button 
          onClick={() => setShowCompose(true)}
          className="flex items-center gap-3 bg-[#0F2044] text-white px-6 py-3.5 rounded-2xl hover:bg-[#1a2a5c] font-medium"
        >
          <Megaphone className="w-5 h-5" />
          New Announcement
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-3xl p-8 border border-[#0F2044]/8">
          <p className="text-sm text-[#0F2044]/60">Total Announcements This Term</p>
          <p className="text-5xl font-bold text-[#0F2044] mt-4">24</p>
        </div>
        <div className="bg-white rounded-3xl p-8 border border-[#0F2044]/8">
          <p className="text-sm text-[#0F2044]/60">Parents Reached Today</p>
          <p className="text-5xl font-bold text-emerald-600 mt-4">312</p>
        </div>
        <div className="bg-white rounded-3xl p-8 border border-[#0F2044]/8">
          <p className="text-sm text-[#0F2044]/60">Pending SMS Notifications</p>
          <p className="text-5xl font-bold text-amber-600 mt-4">18</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {["All", "Academic", "Boarding", "Finance", "Events"].map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-7 py-3 rounded-2xl font-medium transition-all ${
              filterType === type 
                ? "bg-[#0F2044] text-white" 
                : "bg-white border border-[#0F2044]/10 hover:bg-[#F7F5F0]"
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Announcements List */}
      <div className="bg-white rounded-3xl overflow-hidden border border-[#0F2044]/8">
        <div className="p-6 bg-[#F7F5F0] border-b flex items-center justify-between">
          <h3 className="font-semibold text-lg">Recent Announcements</h3>
          <span className="text-sm text-[#0F2044]/60">{filteredAnnouncements.length} announcements</span>
        </div>

        <div className="divide-y">
          {filteredAnnouncements.map((announcement) => (
            <div key={announcement.id} className="p-8 hover:bg-[#F7F5F0]/70 transition-colors">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`px-4 py-1 text-xs font-medium rounded-full 
                      ${announcement.priority === "High" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                      {announcement.priority}
                    </span>
                    <span className="text-sm text-[#0F2044]/60">{announcement.date}</span>
                    <span className="px-4 py-1 bg-[#F4B400]/10 text-[#F4B400] text-xs rounded-full">
                      {announcement.type}
                    </span>
                  </div>

                  <h4 className="text-xl font-semibold text-[#0F2044] mb-3">{announcement.title}</h4>
                  <p className="text-[#0F2044]/70 leading-relaxed">{announcement.message}</p>

                  <div className="mt-6 flex items-center gap-6 text-sm">
                    <div>
                      <span className="text-[#0F2044]/60">To: </span>
                      <span className="font-medium">{announcement.audience}</span>
                    </div>
                    <div>
                      <span className="text-[#0F2044]/60">By: </span>
                      <span className="font-medium">{announcement.postedBy}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-4 md:min-w-[140px]">
                  <div className="text-right">
                    <div className="text-xs text-[#0F2044]/60">Reached</div>
                    <div className="font-semibold text-emerald-600">{announcement.readCount} parents</div>
                  </div>

                  <div className="flex gap-3">
                    <button className="p-3 border border-[#0F2044]/20 rounded-2xl hover:bg-[#F7F5F0]">
                      <Eye className="w-5 h-5" />
                    </button>
                    <button className="px-6 py-3 bg-[#0F2044] text-white text-sm rounded-2xl hover:bg-[#1a2a5c]">
                      Send Again
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Compose New Announcement Modal */}
      {showCompose && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="p-8 border-b">
              <h3 className="text-2xl font-bold">Create New Announcement</h3>
            </div>

            <div className="p-8 space-y-8">
              <div>
                <label className="block text-sm font-medium text-[#0F2044]/70 mb-2">Title</label>
                <input 
                  type="text" 
                  className="w-full px-6 py-4 border border-[#0F2044]/10 rounded-2xl focus:outline-none focus:border-[#F4B400]"
                  placeholder="e.g. Parent-Teacher Meeting"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#0F2044]/70 mb-2">Message</label>
                <textarea 
                  rows={6}
                  className="w-full px-6 py-4 border border-[#0F2044]/10 rounded-3xl focus:outline-none focus:border-[#F4B400]"
                  placeholder="Write your announcement here..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-[#0F2044]/70 mb-2">Target Audience</label>
                  <select className="w-full px-6 py-4 border border-[#0F2044]/10 rounded-2xl">
                    <option>All Parents</option>
                    <option>Boarding Parents Only</option>
                    <option>Form 4 Parents</option>
                    <option>Parents with Fee Arrears</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#0F2044]/70 mb-2">Priority</label>
                  <select className="w-full px-6 py-4 border border-[#0F2044]/10 rounded-2xl">
                    <option>Normal</option>
                    <option>High</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-4 pt-6 border-t">
                <button 
                  onClick={() => setShowCompose(false)}
                  className="flex-1 py-4 border border-[#0F2044]/20 rounded-2xl font-medium hover:bg-[#F7F5F0]"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    alert("Announcement sent successfully! (Demo)");
                    setShowCompose(false);
                  }}
                  className="flex-1 py-4 bg-[#0F2044] text-white rounded-2xl font-medium hover:bg-[#1a2a5c]"
                >
                  Send Announcement
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}