// src/components/QuickStats.jsx
import React from "react";
import useStats from "../hooks/useStats";
import "./css/QuickStats.css";

export default function QuickStats() {
    const { stats, loading } = useStats();

    return (
        <div className="card small quick-stats-card">
            <h4 style={{ marginTop: 0 }}>Quick stats</h4>
            <div className="stats-grid" style={{ marginTop: 8 }}>
                <div>
                    <div className="stat-num">{loading.users ? "…" : stats.users}</div>
                    <div className="stat-label">Total users</div>
                </div>
                <div>
                    <div className="stat-num">{loading.publicTrips ? "…" : stats.publicTrips}</div>
                    <div className="stat-label">Trips created</div>
                </div>
            </div>
        </div>
    );
}
