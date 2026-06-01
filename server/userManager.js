class User {
    constructor(data) {
        this.room = null;
        this.data = data;
        this.id = data.id;
    }

    joinRoom(room) {
        this.room = room;
        room.joinRoom(this.data);
    }

    leaveRoom(room) {
        this.room = null;
        room.leaveRoom(this.data);
    }
}

class UserManager {
    constructor() {
        this.users = new Map();
    }

    createUser(data) {
        const user = new User(data);

        this.users.set(data.id, user);

        return user;
    }

    hasUser(id) {
        return this.users.has(id)
    }

    getUser(id) {
        return this.users.get(id);
    }
}

export const userManager = new UserManager();