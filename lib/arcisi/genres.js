/**
 * Logic for specific room types / families.  To be broken out into separate
 *  implementation files as needed.
 **/

define(
  [
    'exports'
  ],
  function(
    exports
  ) {

var genreRegistry = exports.genreRegistry = {};

/**
 * Lobbies are the hubs from which hallways radiate.  We also want to size them
 *  in proportion to the number of people we think would ever need to wait there
 *  for people coming out of the building, to be retrieved by people in the
 *  building, etc.
 */
genreRegistry['lobby'] = {
  COUCH_WIDTH: 200,
  COUCH_DEPTH: 90,
  COUCH_AISLE: 60,

  TABLE_WIDTH: 70,

  BASELINE_COUCHES: 2,
  OCCUPANTS_PER_COUCH: 40,

  createRoomsForFloor: function(spacer, floorCtx, buildingCtx) {
    var occupants = (floorCtx.num === 0) ? buildingCtx.occupants
                                         : floorCtx.occupants;
    var numCouches = this.BASELINE_COUCHES +
                     Math.floor(occupants / this.OCCUPANTS_PER_COUCH);

    var aCouch = this.COUCH_DEPTH + this.COUCH_AISLE * 2 + this.TABLE_WIDTH,
        bCouch = this.COUCH_WIDTH + this.COUCH_AISLE * 2;

    var area = numCouches * aCouch * bCouch;

    var lobby = spacer.requestRoughSize(bCouch, aCouch, area, 0.5, 1);
    lobby.type = 'lobby';
    return [lobby];
  },
};

/**
 * Provides commercial office-space know-how.
 */
genreRegistry['office'] = {
  // - cube farmy stuff
  DESK_LENGTH: 160,
  DESK_WIDTH: 80,
  // space for the seat at the desk
  DESK_SEATING: 60,
  // Space for people to walk behind the person seated at the desk.  One aisle
  //  suffices for desks on both sides of the aisle.
  DESK_AISLE: 60,
  // A larger aisle that does not have desk seating on its sides.
  MAIN_AISLE: 100,

  MAIN_AISLE_EVERY_N: 2,


  // - conference rooms
  CONF_PERIM_AISLE_WIDTH: 60,
  CONF_TABLE_SEG_LENGTH: 60,
  CONF_TABLE_SEG_WIDTH: 60,
  CONF_TABLE_SEATING: 60,

  processNeeds: function(needs, buildingCtx) {
    buildingCtx.occupants += needs.openPlanDesks + needs.privateOffices;

    // XXX should divvy per floor in a subsequent pass
    buildingCtx.blackboards.office = needs;
  },

  createRoomsForFloor: function(spacer, floorCtx, buildingCtx) {
    var needs = buildingCtx.blackboards.office,
        rooms, room;

    // - open plan
    if (needs.openPlanDesks) {
      var tileParallel = this.DESK_AISLE + this.DESK_SEATING + this.DESK_WIDTH,
          tilePerp = this.DESK_LENGTH;

      rooms = spacer.requestTileRegions(needs.openPlanDesks,
                                        this.MAIN_AISLE, this.MAIN_AISLE,
                                        tileParallel, tilePerp,
                                        0, this.MAIN_AISLE_EVERY_N,
                                        0, this.MAIN_AISLE);
      rooms.forEach(function(room) {
        room.type = 'office:openPlan';
      });
    }
    else {
      rooms = [];
    }

    // - private offices
    var poA = this.DESK_WIDTH + this.DESK_SEATING + 2 * this.DESK_AISLE,
        poB = this.DESK_LENGTH + 2 * this.DESK_AISLE;

    for (var iPO = 0; iPO < needs.privateOffices; iPO++) {
      room = spacer.requestExplicitSize(poA, poB, 0.5);
      room.type = 'office:private';
      rooms.push(room);
    }

    // - conference rooms
    for (var iConf = 0; iConf < needs.conferenceRooms.length; iConf++) {
      var capacity = needs.conferenceRooms[iConf], halfCap = capacity / 2,
          ca = (this.CONF_PERIM_AISLE_WIDTH + this.CONF_TABLE_SEG_LENGTH +
                this.CONF_TABLE_SEATING) * 2,
          cb = this.CONF_PERIM_AISLE_WIDTH * 2 +
               this.CONF_TABLE_SEG_WIDTH * halfCap;

      room = spacer.requestExplicitSize(ca, cb, 0.5);
      room.type = 'office:conference';
      rooms.push(room);
    }

    return rooms;
  },
};
/**
 * Provides bathroom know-how.  The current level of modeling is a bit overkill,
 *  but I'm taking this opportunity to do a back-of-the-napkin calculation
 *  because I (sadly) would like to know.  A better estimation would likely
 *  account for queueing theory, scheduling impact (lunch, meeting
 *  quanitization, etc.), etc.
 */
genreRegistry['bathroom'] = {
  // - stalls
  // Interestingly, ambulatory accessible stalls seem to be required once you
  //  hit a total of 6 urinals and wheelchair accessible stalls.
  // ambulatory accessible
  STALL_WIDTH: 92,
  STALL_DEPTH: 172,
  // wheelchair accessible
  WCA_STALL_WIDTH: 156,

  // - sinks
  SINK_WIDTH: 92, // just matching the stall here arbitrarily.

  // - aisle
  AISLE_WIDTH: 122,

  // - estimation constants
  // This seems like an insanely high number even as a bound, but, assuming
  //  maximum utilization of a stall (100% duty cycle), how many people could
  //  it service?  This is basically work day length / arbitrarily chosen
  //  expected average stall time per day.
  MAX_OCCUPANTS_PER_STALL: (480 / 10),
  // What duty cycle would a 1.0 niceness building have?
  TARGET_STALL_DUTY_CYCLE_FOR_NOMNICE: 0.8,
  // What is the worst gender imbalance we think could occur as a proportion?
  //  Specifically, if the value is 0.1 then we think the occupant distribution
  //  could be 0.6 of one gender and 0.4 of the other.  At 0.25, it would be
  //  0.75 of one gender and 0.25 of the other.  This allows us to conclude the
  //  (worst-case) number of occupants expected.
  MAX_GENDER_IMBALANCE: 0.25,

  createRoomsForFloor: function(spacer, floorCtx, buildingCtx) {
    // generate a narrow, deep bathroom for each gender where everything is
    //  perpendicular to the primary axis.

    // - start with the minimum possible
    var sinks = 1, stalls = 0, wca_stalls = 1;

    // - boost based on population
    var occupantsPerStall = this.MAX_OCCUPANTS_PER_STALL *
                            this.TARGET_STALL_DUTY_CYCLE_FOR_NOMNICE *
                            buildingCtx.niceness,
        genderOccupants = floorCtx.occupants *
                          (0.5 + this.MAX_GENDER_IMBALANCE),
        // round from 0.4 up
        boostStalls = Math.floor(0.6 +
                                 genderOccupants / occupantsPerStall);

    stalls += boostStalls;
    sinks += boostStalls;


    // - size the room
    var depth = sinks * this.SINK_WIDTH +
                stalls * this.STALL_WIDTH +
                wca_stalls * this.WCA_STALL_WIDTH,
        width = this.STALL_DEPTH + this.AISLE_WIDTH;

    var maleRoom = spacer.requestExplicitSize(depth, width, 0.0, -1),
        femaleRoom = spacer.requestExplicitSize(depth, width, 0.0, -1);
    maleRoom.name = "Men's Lavatory";
    femaleRoom.name = "Women's Lavatory";
    return [maleRoom, femaleRoom];
  },
};

genreRegistry['stairs'] = {
};
genreRegistry['elevator'] = {
};

}); // end define
