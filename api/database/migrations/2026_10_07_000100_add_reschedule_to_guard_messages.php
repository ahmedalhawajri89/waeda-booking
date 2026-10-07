<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Rescheduling by conversation: an offer of times carries the times it
 * offered (and whether one was taken) in `payload`, and replies can now be
 * read as asking to move or as picking one of those times.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('guard_messages', function (Blueprint $table) {
            $table->json('payload')->nullable()->after('intent');
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE guard_messages MODIFY intent ENUM('confirm','cancel','late','reschedule','choose','unknown') NULL");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::table('guard_messages')->whereIn('intent', ['reschedule', 'choose'])->update(['intent' => 'unknown']);
            DB::statement("ALTER TABLE guard_messages MODIFY intent ENUM('confirm','cancel','late','unknown') NULL");
        }

        Schema::table('guard_messages', function (Blueprint $table) {
            $table->dropColumn('payload');
        });
    }
};
