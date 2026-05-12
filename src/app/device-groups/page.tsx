'use client';

import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { deviceGroups } from '@/mocks/fixtures';
import { Layers3, ChevronRight, Plus, Link2 } from 'lucide-react';

export default function DeviceGroupsPage() {
  // Build tree
  const roots = deviceGroups.filter((g) => g.parent_id === null);
  const childrenOf = (id: string) => deviceGroups.filter((g) => g.parent_id === id);

  return (
    <AppShell title="デバイスグループ" breadcrumb={['ホーム', 'グループ']}>
      <div className="flex items-center justify-end mb-4">
        <Button size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />新規グループ
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">グループ階層</CardTitle>
          <p className="text-xs text-muted-foreground">エリア単位や連動再生グループを階層管理</p>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1">
            {roots.map((root) => (
              <GroupNode key={root.id} group={root} childrenList={childrenOf(root.id)} depth={0} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </AppShell>
  );
}

function GroupNode({
  group,
  childrenList,
  depth,
}: {
  group: typeof deviceGroups[number];
  childrenList: typeof deviceGroups;
  depth: number;
}) {
  return (
    <li>
      <div
        className="flex items-center gap-2 p-2.5 rounded-md hover:bg-accent transition-colors group"
        style={{ paddingLeft: `${depth * 24 + 10}px` }}
      >
        {childrenList.length > 0 ? (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <div className="w-3.5" />
        )}
        <Layers3 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{group.name}</span>
        {group.linked && (
          <Badge variant="default" className="gap-1 text-[10px]">
            <Link2 className="h-2.5 w-2.5" />連動再生
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {group.device_count} 台
          {group.child_group_count > 0 && ` · ${group.child_group_count} 子グループ`}
        </span>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">編集</Button>
        </div>
      </div>
      {childrenList.length > 0 && (
        <ul className="space-y-1 mt-1">
          {childrenList.map((c) => (
            <GroupNode
              key={c.id}
              group={c}
              childrenList={deviceGroups.filter((x) => x.parent_id === c.id)}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
