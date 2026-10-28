/* ===================================================================
   WHICH CHARTER A TEAM HAS
   ===================================================================
   A team with its own pin board (Teams & groups, "Pin board") has a
   charter; teams sharing a board share one, and a sub-team folds into its
   parent, so it never has one under its own name. A group with no board
   has none. The hub's home (hub-app.js) and the phone app (egbc-app.js)
   both ask here, so the two can never disagree.

   The charter is pageContent/<board>-charter. The one exception is the
   first board the hub ever had (document 'state', from before boards had
   names), whose charter was already stored as 'wider-worship-charter'.

     EGBCCharters.forTeam(team) -> { id, url? } or null
   =================================================================== */
(function (global) {
  'use strict';
  var DOC_FOR_BOARD = { state: 'wider-worship-charter' };
  /* The standalone charter pages in this code base, by the charter they
     show: a fact about those files, so a card can link to a full page. */
  var FILE = {
    'wider-worship-charter': 'Worshipteamcharter.html',
    'youth-charter': 'Youthcharter.html',
    'core-team-charter': 'Coreteamcharter.html'
  };

  /**
   * The charter a team shows.
   * @param {string} team a team id
   * @returns {{id: string, url?: string}|null} the pageContent document and
   *   any standalone page; null for a team with no charter
   */
  function forTeam(team) {
    var T = global.EGBCAuth && EGBCAuth.TEAMS && EGBCAuth.TEAMS[team];
    if (!T || T.archived || T.parent || !T.board) return null;
    var id = DOC_FOR_BOARD[T.board] || (T.board + '-charter');
    return FILE[id] ? { id: id, url: FILE[id] } : { id: id };
  }

  global.EGBCCharters = { forTeam: forTeam };
})(window);
