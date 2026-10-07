<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What a guest sees at the top of a business's booking page, and how its
 * catalogue is grouped.
 *
 * Until now there was one business and its profile lived in the client.
 * With sign-up creating businesses, each needs its own: what kind of place it
 * is and where. Services gain a category so the booking page can group them
 * the way the business sells them, and staff gain a role ("أخصائية بشرة") so
 * a guest choosing who to see knows who they are choosing.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('organizations', function (Blueprint $table) {
            $table->string('category', 64)->nullable()->after('slug');
            $table->string('address')->nullable()->after('category');
        });
        Schema::table('services', function (Blueprint $table) {
            $table->string('category', 64)->nullable()->after('name');
        });
        Schema::table('resources', function (Blueprint $table) {
            $table->string('role', 120)->nullable()->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('organizations', fn (Blueprint $t) => $t->dropColumn(['category', 'address']));
        Schema::table('services', fn (Blueprint $t) => $t->dropColumn('category'));
        Schema::table('resources', fn (Blueprint $t) => $t->dropColumn('role'));
    }
};
