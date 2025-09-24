// src/components/Profile.jsx
import React from "react";
import PropTypes from "prop-types";
import { normalizeHandle } from "../utils/handle";
import bikeGif from "../assets/bike-running.gif"; // optional small icon if you want

export default function Profile({
    profile,
    user,
    resolvedUid,
    isFollowing,
    followLoading,
    onToggleFollow,
    onShare,
    onEditProfile,
    onOpenFollowers,
    onOpenFollowing,
    showCounts = true,
    showBanner = true,
}) {
    const displayName = profile?.displayName || profile?.name || "Profile";
    const handle = profile?.handle ? `@${normalizeHandle(profile.handle)}` : "";
    const bio = profile?.bio || "";
    const followersCount = Array.isArray(profile?.followers) ? profile.followers.length : (profile?.followersCount ?? 0);
    const followingCount = Array.isArray(profile?.following) ? profile.following.length : (profile?.followingCount ?? 0);
    const isOwner = user && resolvedUid && user.uid === resolvedUid;

    const avatarUrl = profile?.photoURL || profile?.avatar || null;
    // small fallback initials
    const initials = (displayName || "P").split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase();

    return (
        <div className="profile-panel">
            {showBanner && (
                <div className="profile-banner" style={{ backgroundImage: profile?.bannerUrl ? `url(${profile.bannerUrl})` : undefined }}>
                    {!profile?.bannerUrl && <div className="profile-banner-fallback"> </div>}
                </div>
            )}

            <div className="profile-meta">
                <div className="profile-identity">
                    <div className="profile-avatar-wrap">
                        {avatarUrl ? (
                            <img src={avatarUrl} alt={`${displayName} avatar`} className="profile-avatar" />
                        ) : (
                            <div className="profile-avatar-fallback">{initials}</div>
                        )}
                    </div>

                    <div className="profile-names">
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <h2 className="profile-name">{displayName}</h2>
                            {profile?.isActive && <img src={bikeGif} alt="active" className="profile-active-icon" />}
                        </div>
                        <div className="profile-handle">{handle}</div>
                        {bio && <div className="profile-bio">{bio}</div>}
                    </div>
                </div>

                <div className="profile-actions">
                    {showCounts && (
                        <div className="profile-stats">
                            <button className="link-like" onClick={onOpenFollowers} aria-label="Open followers">
                                <strong>{followersCount}</strong>
                                <div className="muted small">Followers</div>
                            </button>
                            <button className="link-like" onClick={onOpenFollowing} aria-label="Open following">
                                <strong>{followingCount}</strong>
                                <div className="muted small">Following</div>
                            </button>
                        </div>
                    )}

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {isOwner ? (
                            <button className="btn-secondary" onClick={onEditProfile}>Edit profile</button>
                        ) : (
                            <button
                                className={`btn-follow ${isFollowing ? "following" : ""}`}
                                onClick={onToggleFollow}
                                disabled={followLoading}
                                aria-pressed={isFollowing}
                                title={isFollowing ? "Unfollow" : "Follow"}
                            >
                                {followLoading ? "..." : (isFollowing ? "Following" : "Follow")}
                            </button>
                        )}

                        <button className="btn-start" onClick={onShare} title="Share profile">Share</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

Profile.propTypes = {
    profile: PropTypes.object,
    user: PropTypes.object,
    resolvedUid: PropTypes.string,
    isFollowing: PropTypes.bool,
    followLoading: PropTypes.bool,
    onToggleFollow: PropTypes.func,
    onShare: PropTypes.func,
    onEditProfile: PropTypes.func,
    onOpenFollowers: PropTypes.func,
    onOpenFollowing: PropTypes.func,
    showCounts: PropTypes.bool,
    showBanner: PropTypes.bool,
};
