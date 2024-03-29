/**
 * Initial home of all logic; to be refactored as things grow.
 *
 * We have randomly selected baking as our initial metaphor.  This is mainly
 *  done because this will tend to avoid collisions with my other emacs buffers.
 *
 * We have two major rendering/display modes:
 * - Floor plan.  We generate 3d models for each floor of a building in
 *    isolation.
 * - Building shell.  We generate a 3d model for the entire building consisting
 *    of what you can see from the outside of the building when all the windows
 *    have decided to be opaque.
 *
 *
 **/

define(
  [
    './displayer',
    './genres',
    'exports'
  ],
  function(
    $displayer,
    $genres,
    exports
  ) {

function BuildingContext() {
  /**
   * Running tally of expected occupants.  This is automatically tabulated from
   *  the needs specifications of a building.
   *
   * This is intended to represent the number of occupants at peek occupancy,
   *  not the total number of people who might pass through a building in a day.
   */
  this.occupants = 0;

  /**
   * An adjustment factor for the niceness of the building.  The idea is to
   *  provide a single knob to affect design calls where it is possible to skimp
   *  on things in a building but still have the building be legal-ish.
   *
   * The scale should end up something like:
   * - 0.0: Building constructed by sociopaths.  The absolute, bare minimum of
   *         bathrooms, elevators, etc.
   * - 1.0: Building constructed by people who don't want the occupants to mount
   *         an insurrection but also don't want to spend a lot.
   * - 2.0: Building constructed by saints without credit limits or accountants.
   */
  this.niceness = 1.0;

  this.blackboards = {};

  this.activeGenres = [];
}
BuildingContext.prototype = {
};

function FloorContext(floorNum) {
  this.num = floorNum;
  this.occupants = 0;

  this.blackboards = {};
}
FloorContext.prototype = {
};

/**
 * A linear hallway apportions space along one or both of its sides from a
 *  containing region which may either be strict (the walls are definitely
 *  going here) or advisory (what goes there defines the walls, but we would
 *  like the envelope to target certain metrics).
 *
 * @args[
 * ]
 */
function LinearHallway(leftBounds, rightBounds) {
  this._leftBounds = leftBounds;
  this._rightBounds = rightBounds;

  this._leftRooms = [];
  this._rightRooms = [];

  this._leftDist = 0;
  this._rightDist = 0;

  this.room = new Room();
  this.room.type = 'hallway';
  this.room.linkedRooms = [];
  this.room.doors = [];

  // hall growth along the x-axis
  this.gx = 0;
  // hall growth along the z-axis
  this.gz = 0;
  // room growth away from the hall along the x-axis
  this.gpx = 0;
  // room growth away from the hall allong the z-axis
  this.gpz = 0;
}
LinearHallway.prototype = {
  HALLWAY_WIDTH: 200,

  growFrom: function(cx, cz, gx, gz, gpx, gpz, owningRoom) {
    // growth vector for the hallway to lengthen the hallway
    this.gx = gx;
    this.gz = gz;

    // displacement vector to the 'left' for the hall
    this.gpx = gpx;
    this.gpz = gpz;

    var hhw = this.HALLWAY_WIDTH / 2;

    // center us at the entry
    this.room.x1 = cx + gpx * hhw;
    this.room.x2 = cx - gpx * hhw;
    this.room.z1 = cz + gpz * hhw;
    this.room.z2 = cz - gpz * hhw;

    // create a giant door since this is a hallway...
    var dwt = WALL_THICKNESS * 2;
    var door = {
      x1: this.room.x1 - gpx * dwt,
      x2: this.room.x2 + gpx * dwt,
      z1: this.room.z1 - gpz * dwt,
      z2: this.room.z2 + gpz * dwt,
    };
    normalizeDoor(door);
    owningRoom.doors.push(door);
  },

  LARGEST_ALONG: 1500,
  LARGEST_PERP: 2000,
  queryLargestAvailableSpace: function() {
    return {
      a: this.LARGEST_ALONG,
      b: this.LARGEST_PERP,
    };
  },

  allocate: function(a, b, doorRelPos) {
    var room = new Room();

    // try and minimize floor distance allocated by swapping if required
    if (a > b) {
      var c = a;
      a = b;
      b = c;
    }

    var effa, door;
    if (this._leftDist <= this._rightDist) {
      // grow away from x1
      room.x1 = this.room.x1 + b * this.gpx +
                this._leftDist * this.gx +
                a * this.gx;
      // stick to x1
      room.x2 = this.room.x1 +
                this._leftDist * this.gx;
      // grow away from leftdist from
      room.z1 = this.room.z1 + b * this.gpz +
                this._leftDist * this.gz +
                a * this.gz;
      room.z2 = this.room.z1 + b * this.gpz +
                this._leftDist * this.gz;

      // position the door along the wall surface
      effa = DOOR_HALF_WIDTH +
             this._leftDist + WALL_THICKNESS + (a - DOOR_WIDTH) * doorRelPos;
      door = {
        x1: this.room.x1 + (effa - DOOR_HALF_WIDTH) * this.gx,
        x2: this.room.x1 + (effa + DOOR_HALF_WIDTH) * this.gx,
        z1: this.room.z1 + (effa - DOOR_HALF_WIDTH) * this.gz,
        z2: this.room.z1 + (effa + DOOR_HALF_WIDTH) * this.gz,
      };
      normalizeDoor(door);
      this.room.doors.push(door);

      this._leftDist += a;
    }
    else {
      // stick to x2
      room.x1 = this.room.x2 +
                this._rightDist * this.gx;
      // grow away from x1
      room.x2 = this.room.x2 - b * this.gpx +
                this._rightDist * this.gx +
                a * this.gx;
      // grow away from rightdist from
      room.z1 = this.room.z1 - b * this.gpz +
                this._rightDist * this.gz +
                a * this.gz;
      room.z2 = this.room.z1 - b * this.gpz +
                this._rightDist * this.gz;

      // position the door along the wall surface
      effa = DOOR_HALF_WIDTH +
             this._rightDist + WALL_THICKNESS + (a - DOOR_WIDTH) * doorRelPos;
      door = {
        x1: this.room.x2 + (effa - DOOR_HALF_WIDTH) * this.gx,
        x2: this.room.x2 + (effa + DOOR_HALF_WIDTH) * this.gx,
        z1: this.room.z1 + (effa - DOOR_HALF_WIDTH) * this.gz,
        z2: this.room.z1 + (effa + DOOR_HALF_WIDTH) * this.gz,
      };
      normalizeDoor(door);
      this.room.doors.push(door);

      this._rightDist += a;
    }

    this.room.linkedRooms.push(room);
    return room;
  },

  finishLayout: function() {
    var grew = Math.max(this._leftDist, this._rightDist);
    this.room.x2 += grew * this.gx;
    this.room.z2 += grew * this.gz;
  },
};

function FirstRoomAllocator() {
  this.rootRoom = null;
}
FirstRoomAllocator.prototype = {
  allocate: function(a, b, doorRelPos) {
    var room = this.rootRoom = new Room();
    room.doors = [];
    room.x1 = -a/2;
    room.x2 = a/2;
    room.z1 = 0;
    room.z2 = b;

    return room;
  },

  linkHallway: function(hallway) {
    // center the hallway at 0 on the x-axis, which is right because we grew
    //  along the x-axis in both directions by a/2.
    // start the hallway at 0 on the z-axis, growing in the -z direction
    //  because our room grew in the positive z direction.
    // and the hallway should know that left is -x.
    hallway.growFrom(0, 0, 0, -1, -1, 0, this.rootRoom);
  },
};

/**
 * Conceivable modes of operation for the space-provider:
 * - Base case: No rooms exist anywhere, the first room anchors the building.
 * - Expansionary: No spare space or potential regions exist and so must be
 *    created.
 * - Dispensary: Spare space (from an existing envelope) or potential regions
 *    (planned at a higher level but not filled with things yet) are used
 *    to fulfill requests for space.
 *
 * Potential placement modes/phases:
 * - Request: Accumulate requests and provide handles, but do not perform sizing
 *    placement yet.
 * - Placement: After all requests are processed, perform placement and sizing
 *    so that we can figure out what best fits into pre-planned envelopes or
 *    would allow for the most consistent sizing for an envelope, etc.
 * - Big rock immediate: For large-scale rooms with flow needs, perform
 *    placement immediately.  This requires/assumes that the provider of the
 *    big rocks requests rooms in a flow-appropriate manner.  (This could also
 *    be converted into a request-style representation, of course.)
 *
 * Potential placement factors to consider:
 * - Labeled regions/distance scents.  You wouldn't interleave office spaces
 *    with heavy machinery or put all the meeting rooms for offices all the
 *    way at the other end of the building after the warehouse.
 *
 * Now, obviously, we could use fancy pants CSP to try and do things, but I'm
 *  going to assert that it would produce less interesting buildings, or at
 *  least require more work on my part.
 */
function SpaceProvider() {
  this._underlying = null;
}
SpaceProvider.prototype = {
  useForSpace: function(underlying) {
    this._underlying = underlying;
  },

  /**
   * Request a room of a specific size.
   *
   * @args[
   *   @param[Asize]{
   *     First dimension of the room.
   *   }
   *   @param[Bsize]{
   *     Second dimension of the room.
   *   }
   *   @param[doorRelPos]{
   *     0.0 to put the door near the start/end of the room, 0.5 for the middle.
   *   }
   *   @param[windowDesire @oneof[
   *     @case[-1]{
   *       No windows, please.
   *     }
   *     @case[0]{
   *       Don't care.
   *     }
   *     @case[1]{
   *       Windows, please.
   *     }
   *   ]]
   * ]
   */
  requestExplicitSize: function(Asize, Bsize, doorRelPos, windowDesire) {
    return this._underlying.allocate(Asize, Bsize, doorRelPos);
  },

  /**
   * Request a room with given area where we are flexible about how the
   *  dimensions are given.
   */
  requestRoughSize: function(Amin, Bmin, area, doorRelPos, windowDesire) {
    var minArea = Amin * Bmin;
    if (minArea > area)
      throw new Error("the minimum area must not exceed the requested area");

    var Amax = Math.floor(area / Bmin),
        Adelta = Amax - Amin;
    var Ause = Amin + Math.floor(Math.random() * Adelta),
        Buse = Math.floor(area / Ause);

    return this._underlying.allocate(Ause, Buse, doorRelPos);
  },

  /**
   * Request one or more rooms to meet a need for tile-able things.  For
   *  example, a cube farm/open plan workspace only cares about space for N
   *  desks; it does not really want a single giant room with a specific size.
   *
   * @args[
   *   @param[AminCount]{
   *     The minimum number of tilings along the A-axis for the space to be
   *     considered acceptable.
   *   }
   *   @param[BminCount]
   *   @param[Apadding]{
   *     Base space needs along the A-axis.
   *   }
   *   @param[Bpadding]
   *   @param[Asize]{
   *     Tile size along the A-axis.
   *   }
   *   @param[Bsize]
   *   @param[AexpandCount]{
   *     Provide `AexpandSize` extra space for every `AexpandCount` tilings
   *     along the A-axis.  This is intended to be used to provide space for
   *     things that become necessary as tiled areas get larger.  For example,
   *     an open-plan desk tiling that forms long rows might be okay with only
   *     the perpendicular aisles provided by the 'padding' at low numbers
   *     of desks, but could need additional space for more perpendicular
   *     aisles as the number of desks in the row increases.
   *   }
   *   @param[BexpandCount]
   *   @param[AexpandSize]
   *   @param[BexpandSize]
   * ]
   */
  requestTileRegions: function(tileCount,
                               Apadding, Bpadding, Asize, Bsize,
                               AexpandCount, BexpandCount,
                               AexpandSize, BexpandSize) {
    var weightedA = Asize, weightedB = Bsize, rooms = [];
    if (AexpandCount)
      weightedA += (AexpandSize / AexpandCount);
    else
      AexpandCount = 1;
    if (BexpandCount)
      weightedB += (BexpandSize / BexpandCount);
    else
      BexpandCount = 1;

    // We have a greedy approach.  We try and ask our allocator for the largest
    //  size possible.  We size for as many as can fit (undershooting).  Then
    //  we repeat.
    while (tileCount > 0) {
      var avail = this._underlying.queryLargestAvailableSpace();
      avail.a -= Apadding;
      avail.b -= Bpadding;

      var numA = Math.max(1, Math.floor(avail.a / weightedA)),
          numB = Math.max(1, Math.floor(avail.b / weightedB)),
          actualA = Apadding + numA * Asize +
                    Math.floor(numA / AexpandCount) * AexpandSize,
          actualB = Bpadding + numB * Bsize +
                    Math.floor(numB / BexpandCount) * BexpandSize;

      var room = this._underlying.allocate(actualA, actualB, 0.5);
      rooms.push(room);

      tileCount -= numA * numB;
    }

    return rooms;
  },
};

const WALL_THICKNESS = 10,
      FLOOR_THICKNESS = 10,
      ROOM_HEIGHT = 320, ROOM_HALF_HEIGHT = ROOM_HEIGHT / 2,
      DOOR_HEIGHT = 250, DOOR_HALF_HEIGHT = DOOR_HEIGHT / 2,
      DOOR_WIDTH = 120, DOOR_HALF_WIDTH = DOOR_WIDTH / 2,
      DOOR_HALF_THICKNESS = 15;

const DEFAULT_COLOR = {r: 0.8, g: 0.8, b: 0.8};
const COLOR_MAP = {
  "lobby": {r: 1.0, g: 0.5, b: 0.5},
  "hallway": {r: 0.8, g: 0.4, b: 0.4},
  "bathroom": {r: 0.5, g: 0.5, b: 0.5},
  "office:private": {r: 0.5, g: 1.0, b: 0.5},
  "office:conference": {r: 0.6, g: 1.0, b: 0.6},
  "office:openPlan": {r: 0.7, g: 1.0, b: 0.7},
};

function normalizeDoor(door) {
  var swapper;
  if (door.x1 > door.x2) {
    swapper = door.x2;
    door.x2 = door.x1;
    door.x2 = swapper;
  }
  if (door.z1 > door.z2) {
    swapper = door.z2;
    door.z2 = door.z1;
    door.z1 = swapper;
  }
}

/**
 * Everything in a building is a room (for now).
 *
 * Rooms know:
 * - their bounding size
 * - where doors are, what rooms those doors go to
 * - which walls are exterior or interior
 * - their type
 *
 * Rooms do not know:
 * - their exact position
 *
 * Rooms can:
 * - generate floorplan geometry for themselves
 * - generate building shell geometry for themselves
 */
function Room() {
  this.x1 = null;
  this.z1 = null;
  this.x2 = null;
  this.z2 = null;

  this.name = null;
  this.type = null;
  this.linkedRooms = null;
  this.doors = null;
}
Room.prototype = {
  normalizeGeom: function() {
    var swapper;
    // normalize us
    if (this.x1 > this.x2) {
      swapper = this.x2;
      this.x2 = this.x1;
      this.x1 = swapper;
    }
    if (this.z1 > this.z2) {
      swapper = this.z2;
      this.z2 = this.z1;
      this.z1 = swapper;
    }
  },

  makeFloorplanGeometry: function(by) {
    this.normalizeGeom();

    var dx = this.x2 - this.x1, hdx = dx / 2,
        dz = this.z2 - this.z1, hdz = dz / 2;

    var wallShell = CSG.cuboid(
                      { center: [this.x1 + hdx,
                                   by + ROOM_HALF_HEIGHT,
                                   this.z1 + hdz],
                        radius: [hdx, ROOM_HALF_HEIGHT, hdz] }),
        innerSpace = CSG.cuboid(
                       { center: [this.x1 + hdx,
                                    by + ROOM_HALF_HEIGHT + FLOOR_THICKNESS,
                                    this.z1 + hdz],
                         radius: [hdx - WALL_THICKNESS,
                                  ROOM_HALF_HEIGHT,
                                  hdz - WALL_THICKNESS] });

    //console.log(this.x1, this.z1, this.x2, this.z2);

    var color;
    if (COLOR_MAP.hasOwnProperty(this.type))
      color = COLOR_MAP[this.type];
    else
      color = DEFAULT_COLOR;

    wallShell.setColor(color.r, color.g, color.b);
    innerSpace.setColor(color.r, color.g, color.b);

    var geom = wallShell.subtract(innerSpace);

    if (this.linkedRooms) {
      for (var iRoom = 0; iRoom < this.linkedRooms.length; iRoom++) {
        var linkedRoom = this.linkedRooms[iRoom],
            othGeom = linkedRoom.makeFloorplanGeometry(by);
        geom = geom.union(othGeom);
      }
    }

    if (this.doors) {
      for (var iDoor = 0; iDoor < this.doors.length; iDoor++) {
        var door = this.doors[iDoor];
        dx = door.x2 - door.x1;
        hdx = dx / 2;
        dz = door.z2 - door.z1;
        hdz = dz / 2;
        var htx = (dx === 0) ? DOOR_HALF_THICKNESS : 0,
            htz = (dz === 0) ? DOOR_HALF_THICKNESS : 0;

        //console.log('door', door.x1, door.z1, door.x2, door.z2,
        //            'hd', hdx, hdz, 'ht', htx, htz);
        var doorGeom = CSG.cuboid(
          {
            center: [door.x1 + hdx,
                     by + DOOR_HALF_HEIGHT + FLOOR_THICKNESS,
                     door.z1 + hdz],
            radius: [hdx + htx, DOOR_HALF_HEIGHT, hdz + htz],
          });
        geom = geom.subtract(doorGeom);
      }
    }

    return geom;
  },

  makeShellGeometry: function(by) {
    this.normalizeGeom();
    var dx = this.x2 - this.x1, hdx = dx / 2,
        dz = this.z2 - this.z1, hdz = dz / 2;

    var geom = CSG.cuboid(
                      { center: [this.x1 + hdx,
                                   by + ROOM_HALF_HEIGHT,
                                   this.z1 + hdz],
                        radius: [hdx, ROOM_HALF_HEIGHT, hdz] });

    if (this.linkedRooms) {
      for (var iRoom = 0; iRoom < this.linkedRooms.length; iRoom++) {
        var linkedRoom = this.linkedRooms[iRoom],
            othGeom = linkedRoom.makeShellGeometry(by);
        geom = geom.union(othGeom);
      }
    }

    return geom;
  },
};


var genreRegistry = $genres.genreRegistry;


/**
 * Genres that every floor must have.
 */
const MANDATED_GENRES = ['bathroom'];
/**
 * Genres that every floor probably needs, but it depends.
 */
const MAYBE_MANDATED_GENRES = ['stairs', 'elevator'];

/**
 * Drives the design of a building from needs/goals through to geometry output.
 */
function Baker(recipe) {
  this.recipe = recipe;
  var ctx = this.context = new BuildingContext();
  ctx.activeGenres = ctx.activeGenres.concat(MANDATED_GENRES);

  this.floors = [];
}
Baker.prototype = {
  processNeeds: function() {
    var needs = this.recipe.needs, ctx = this.context;
    for (var genre in needs) {
      if (ctx.activeGenres.indexOf(genre) === -1)
        ctx.activeGenres.push(genre);

      var genreNeeds = needs[genre];
      genreRegistry[genre].processNeeds(genreNeeds, this.context);
    }
  },

  /**
   * Decide how many floors are required, any genre limitations to apply to
   *  those floors, and apportion occupants amongst those floors.  This is
   *  an initial pass, and exact floor layout happens later.
   *
   * The types of things we ideally want figured out:
   * - In a mixed-use building, allocation of floors to specific purposes.
   * - Mark more valuable floors (ex: high floors, floors above a view
   *   obstruction, floors above the deadly smog, etc.) as such so that they
   *   get 'more valuable' rooms like executive offices, fancy restaurants, etc.
   * - Very simple/obvious load factor considerations; don't store all the lead
   *   bricks on the top floor without a good reason.
   */
  _allocateFloors: function() {
    var numFloors = this.recipe.floors;

    var peepsPerFloor = Math.floor(this.context.occupants / numFloors),
        occupantsLeft = this.context.occupants;

    for (var iFloor = 0; iFloor < numFloors; iFloor++) {
      var floorCtx = new FloorContext(iFloor);

      // - allocate occupants
      if (occupantsLeft > peepsPerFloor)
        floorCtx.occupants = peepsPerFloor;
      else
        floorCtx.occupants = occupantsLeft;
      occupantsLeft -= floorCtx.occupants;

      this.floors.push(floorCtx);
    }
  },

  _layoutFloor: function(floorCtx) {
    var buildingCtx = this.context;

    var spacer = new SpaceProvider(),
        rootAllocator = new FirstRoomAllocator();
    spacer.useForSpace(rootAllocator);

    // - create a lobby.
    var lobby = genreRegistry['lobby'].createRoomsForFloor(spacer, floorCtx,
                                                           buildingCtx)[0];

    floorCtx.room = lobby;

    // - create one or more hallways hooked up to that lobby.
    var hallway = new LinearHallway();

    rootAllocator.linkHallway(hallway);
    spacer.useForSpace(hallway);
    lobby.linkedRooms = [hallway.room];

    // - create rooms
    for (var iGenre = 0; iGenre < buildingCtx.activeGenres.length; iGenre++) {
      var genre = buildingCtx.activeGenres[iGenre];

      var rooms = genreRegistry[genre].createRoomsForFloor(spacer, floorCtx,
                                                           buildingCtx);
    }

    hallway.finishLayout();

  },

  _layoutFloors: function() {
    for (var iFloor = 0; iFloor < this.floors.length; iFloor++) {
      this._layoutFloor(this.floors[iFloor]);
    }
  },

  design: function() {
    this._allocateFloors(1);
    this._layoutFloors();

  },

  render: function(what) {
    var room = this.floors[0].room;

    switch (what) {
      case 'floorplan':
        return room.makeFloorplanGeometry(0);
      case 'shell':
        return room.makeShellGeometry(0);
      default:
        throw new Error('Invalid render request');
    }
  },
};

exports.main = function main(recipe) {
  var baker = new Baker(recipe);


  baker.processNeeds();
  baker.design();
  var ops = baker.render(recipe.render.what);

  //var a = CSG.cuboid({ radius: [1, 1, 1] });
  //var b = CSG.sphere({ radius: 1.5, stacks: 12 });
  //var ops = a.union(b);

  var viewer = new $displayer.Viewer(ops, 640, 640, 6000);
  addViewer(viewer);
};

}); // end define
